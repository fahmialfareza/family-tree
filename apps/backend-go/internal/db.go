package app

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	MongoClient *mongo.Client
	MongoDB     *mongo.Database
	RedisClient *redis.Client
)

func InitMongo(ctx context.Context) error {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	clientOpts := options.Client().ApplyURI(uri).SetServerSelectionTimeout(5 * time.Second)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return err
	}
	MongoClient = client
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "family-tree"
	}
	MongoDB = client.Database(dbName)
	fmt.Println("Connected to MongoDB", uri, "db", dbName)
	// init redis if provided
	redisURL := os.Getenv("REDIS_URL")
	if redisURL != "" {
		if opt, err := redis.ParseURL(redisURL); err == nil {
			RedisClient = redis.NewClient(opt)
			if err := RedisClient.Ping(ctx).Err(); err != nil {
				fmt.Println("warning: redis ping failed:", err)
			} else {
				fmt.Println("Connected to Redis", redisURL)
			}
		} else {
			fmt.Println("warning: invalid REDIS_URL", err)
		}
	}
	return nil
}
