package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/newrelic/go-agent/v3/integrations/nrpgx5"
	nrredis "github.com/newrelic/go-agent/v3/integrations/nrredis-v9"
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
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return err
	}
	DB = db
	fmt.Println("Connected to Postgres", cfg.Host, "db", cfg.Database)
	return nil
}

// InitSchema creates or updates tables and indexes. Safe to call on every startup.
func InitSchema(ctx context.Context) error {
	if err := DB.WithContext(ctx).AutoMigrate(schemaModels...); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}
	fmt.Println("Postgres schema ensured")
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
