package app

import (
	"context"
	"fmt"
	"os"
	"time"

	nrmongo "github.com/newrelic/go-agent/v3/integrations/nrmongo"
	nrredis "github.com/newrelic/go-agent/v3/integrations/nrredis-v9"
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
	// nrmongo command monitor instruments all MongoDB operations with New Relic segments
	monitor := nrmongo.NewCommandMonitor(nil)
	clientOpts := options.Client().ApplyURI(uri).SetServerSelectionTimeout(5 * time.Second).SetMonitor(monitor)
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
			// nrredis hook instruments all Redis commands with New Relic datastore segments
			RedisClient.AddHook(nrredis.NewHook(opt))
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
