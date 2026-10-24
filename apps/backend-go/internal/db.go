package app

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/newrelic/go-agent/v3/integrations/nrpgx5"
	nrredis "github.com/newrelic/go-agent/v3/integrations/nrredis-v9"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	DB          *gorm.DB
	RedisClient *redis.Client
)

// InitPostgres connects to DATABASE_URL. The nrpgx5 tracer instruments every query with New Relic segments.
func InitPostgres(ctx context.Context) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return errors.New("DATABASE_URL is required")
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.Tracer = nrpgx5.NewTracer()
	sqlDB := stdlib.OpenDB(*cfg)
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	if err := sqlDB.PingContext(ctx); err != nil {
		return err
	}
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{
		// Not-found lookups are normal (404s, membership checks), so they are not logged as errors.
		Logger: logger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		}),
	})
	if err != nil {
		return err
	}
	DB = db
	fmt.Println("Connected to Postgres", cfg.Host, "db", cfg.Database)
	return nil
}

//go:embed migrations/*.sql
var migrationFiles embed.FS

// InitSchema applies pending SQL migrations from internal/migrations. Safe to call on every startup:
// a Postgres advisory lock keeps concurrent instances from migrating at the same time.
func InitSchema(ctx context.Context) error {
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	migrations, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return err
	}
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return err
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("init migrations: %w", err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	for _, r := range results {
		fmt.Printf("Applied migration %s (%s)\n", r.Source.Path, r.Duration)
	}
	version, err := provider.GetDBVersion(ctx)
	if err != nil {
		return err
	}
	fmt.Println("Postgres schema at version", version)
	return nil
}

// InitRedis connects to REDIS_URL if set. Redis is optional; failures only log a warning.
func InitRedis(ctx context.Context) {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		return
	}
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		fmt.Println("warning: invalid REDIS_URL", err)
		return
	}
	RedisClient = redis.NewClient(opt)
	// nrredis hook instruments all Redis commands with New Relic datastore segments
	RedisClient.AddHook(nrredis.NewHook(opt))
	if err := RedisClient.Ping(ctx).Err(); err != nil {
		fmt.Println("warning: redis ping failed:", err)
	} else {
		fmt.Println("Connected to Redis", opt.Addr)
	}
}
