// Adds an index on eventResponses.userId (newest first). The home page's event list and
// /user/last-response both look up a user's responses, which otherwise scans the whole collection.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"schej.it/server/db"
)

func main() {
	// Initialize database connection
	disconnect := db.Init()
	defer disconnect()

	_, err := db.EventResponsesCollection.Indexes().CreateOne(
		context.Background(),
		mongo.IndexModel{
			Keys: bson.D{
				{Key: "userId", Value: 1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().SetName("userId_1__id_-1"),
		},
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Created index on eventResponses userId and _id")

	os.Exit(0)
}
