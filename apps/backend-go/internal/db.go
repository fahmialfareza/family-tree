package app

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
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
	maxOpen, err := envInt("DB_MAX_OPEN_CONNS", 20)
	if err != nil {
		return err
	}
	maxIdle, err := envInt("DB_MAX_IDLE_CONNS", 10)
	if err != nil {
		return err
	}
	sqlDB := stdlib.OpenDB(*cfg)
	sqlDB.SetMaxOpenConns(maxOpen)
	sqlDB.SetMaxIdleConns(min(maxIdle, maxOpen))
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	if err := sqlDB.PingContext(ctx); err != nil {
		return err
	}
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{
		// Not-found lookups are normal (404s, membership checks), so they are not logged as errors.
		Logger: logger.New(slog.NewLogLogger(slog.Default().Handler(), slog.LevelWarn), logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			ParameterizedQueries:      true, // never log values: they include password and token hashes
			Colorful:                  false,
		}),
	})
	if err != nil {
		return err
	}
	DB = db
	slog.Info("connected to Postgres", "host", cfg.Host, "db", cfg.Database, "max_open_conns", maxOpen)
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
		slog.Info("applied migration", "path", r.Source.Path, "duration", r.Duration.String())
	}
	version, err := provider.GetDBVersion(ctx)
	if err != nil {
		return err
	}
	slog.Info("Postgres schema ready", "version", version)
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
		slog.Warn("invalid REDIS_URL; Redis disabled")
		return
	}
	RedisClient = redis.NewClient(opt)
	// nrredis hook instruments all Redis commands with New Relic datastore segments
	RedisClient.AddHook(nrredis.NewHook(opt))
	if err := RedisClient.Ping(ctx).Err(); err != nil {
		slog.Warn("redis ping failed", "error", err)
	} else {
		slog.Info("connected to Redis", "addr", opt.Addr)
	}
}

// CloseConnections closes the Postgres pool and the Redis client (on shutdown).
func CloseConnections() {
	if DB != nil {
		if sqlDB, err := DB.DB(); err == nil {
			if err := sqlDB.Close(); err != nil {
				slog.Warn("closing Postgres", "error", err)
			}
		}
	}
	if RedisClient != nil {
		if err := RedisClient.Close(); err != nil {
			slog.Warn("closing Redis", "error", err)
		}
	}
}
