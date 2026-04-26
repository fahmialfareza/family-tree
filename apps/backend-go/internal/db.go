package app

import (
	"context"
	"fmt"
	"os"
	"time"

	nrmongo "github.com/newrelic/go-agent/v3/integrations/nrmongo"
	nrredis "github.com/newrelic/go-agent/v3/integrations/nrredis-v9"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	MongoClient *mongo.Client
	MongoDB     *mongo.Database
	RedisClient *redis.Client
)

// InitIndexes creates all necessary indexes on startup. Safe to call multiple times (uses CreateIfNotExists semantics).
func InitIndexes(ctx context.Context) error {
	type indexDef struct {
		collection string
		model      mongo.IndexModel
	}

	indexes := []indexDef{
		// users: fast login lookup and soft-delete filter
		{
			"users",
			mongo.IndexModel{Keys: bson.D{{Key: "username", Value: 1}, {Key: "deleted", Value: 1}}},
		},
		// people: ownership filter used in list queries
		{
			"people",
			mongo.IndexModel{Keys: bson.D{{Key: "ownedBy", Value: 1}, {Key: "deleted", Value: 1}}},
		},
		// families: ownership filter + person foreign key used in $lookup
		{
			"families",
			mongo.IndexModel{Keys: bson.D{{Key: "ownedBy", Value: 1}, {Key: "deleted", Value: 1}}},
		},
		{
			"families",
			mongo.IndexModel{Keys: bson.D{{Key: "person", Value: 1}}},
		},
		// relationships: graph traversal queries filter by from/to + deleted
		{
			"relationships",
			mongo.IndexModel{Keys: bson.D{{Key: "from", Value: 1}, {Key: "deleted", Value: 1}}},
		},
		{
			"relationships",
			mongo.IndexModel{Keys: bson.D{{Key: "to", Value: 1}, {Key: "deleted", Value: 1}}},
		},
	}

	for _, idx := range indexes {
		col := MongoDB.Collection(idx.collection)
		if _, err := col.Indexes().CreateOne(ctx, idx.model); err != nil {
			return fmt.Errorf("create index on %s: %w", idx.collection, err)
		}
	}
	fmt.Println("MongoDB indexes ensured")
	return nil
}

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
