package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func findUserById(ctx context.Context, id string) (*User, error) {
	col := MongoDB.Collection("users")
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}
	var u User
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	// Soft delete: exclude deleted documents
	filter := bson.M{"_id": oid, "deleted": bson.M{"$ne": true}}
	if err := col.FindOne(ctx, filter).Decode(&u); err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, errors.New("not found")
		}
		return nil, err
	}
	u.ID = id
	return &u, nil
}

func findUserByUsername(ctx context.Context, username string) (*User, error) {
	col := MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var doc bson.M
	// Soft delete: exclude deleted documents
	filter := bson.M{"username": username, "deleted": bson.M{"$ne": true}}
	if err := col.FindOne(ctx, filter).Decode(&doc); err != nil {
		return nil, err
	}

	var u User
	if idv, ok := doc["_id"].(primitive.ObjectID); ok {
		u.ID = idv.Hex()
	}
	if n, ok := doc["name"].(string); ok {
		u.Name = n
	}
	if un, ok := doc["username"].(string); ok {
		u.Username = un
	}
	if p, ok := doc["password"].(string); ok {
		u.Password = p
	}
	if r, ok := doc["role"].(string); ok {
		u.Role = UserRole(r)
	}
	return &u, nil
}

func addUser(ctx context.Context, u *User) (*User, error) {
	col := MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	doc := bson.M{"name": u.Name, "username": u.Username, "password": u.Password, "role": u.Role}
	res, err := col.InsertOne(ctx, doc)
	if err != nil {
		return nil, err
	}
	oid := res.InsertedID.(primitive.ObjectID)
	return findUserById(ctx, oid.Hex())
}

func repoGetAllPeople(ctx context.Context, ownedBy []string) ([]*Person, error) {
	col := MongoDB.Collection("people")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// build match stage
	match := bson.M{"deleted": bson.M{"$ne": true}}
	if len(ownedBy) > 0 {
		// Convert ownedBy strings to ObjectIDs for query
		ownedByOIDs := []primitive.ObjectID{}
		for _, ownerID := range ownedBy {
			if oid, err := primitive.ObjectIDFromHex(ownerID); err == nil {
				ownedByOIDs = append(ownedByOIDs, oid)
			}
		}
		if len(ownedByOIDs) > 0 {
			match["ownedBy"] = bson.M{"$in": ownedByOIDs}
		}
	}

	pipeline := mongo.Pipeline{}
	if len(match) > 0 {
		pipeline = append(pipeline, bson.D{{Key: "$match", Value: match}})
	}

	// lookup owners (users)
	pipeline = append(pipeline, bson.D{{Key: "$lookup", Value: bson.D{
		{Key: "from", Value: "users"},
		{Key: "localField", Value: "ownedBy"},
		{Key: "foreignField", Value: "_id"},
		{Key: "as", Value: "owners"},
	}}})

	// lookup relationships for each person and populate toDetails inside the lookup pipeline
	relPipeline := bson.A{
		bson.D{{Key: "$match", Value: bson.D{
			{Key: "$expr", Value: bson.D{{Key: "$eq", Value: bson.A{"$from", "$$pid"}}}},
			{Key: "deleted", Value: bson.D{{Key: "$ne", Value: true}}},
		}}},
		bson.D{{Key: "$lookup", Value: bson.D{{Key: "from", Value: "people"}, {Key: "localField", Value: "to"}, {Key: "foreignField", Value: "_id"}, {Key: "as", Value: "toDetails"}}}},
	}
	pipeline = append(pipeline, bson.D{{Key: "$lookup", Value: bson.D{
		{Key: "from", Value: "relationships"},
		{Key: "let", Value: bson.D{{Key: "pid", Value: "$_id"}}},
		{Key: "pipeline", Value: relPipeline},
		{Key: "as", Value: "relationships"},
	}}})

	// project owners fields (remove passwords)
	pipeline = append(pipeline, bson.D{{Key: "$project", Value: bson.D{{Key: "password", Value: 0}}}})

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	res := []*Person{}
	for cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			continue
		}
		// map bson.M to Person
		var p Person
		// basic fields
		if v, ok := doc["_id"].(primitive.ObjectID); ok {
			p.ID = v.Hex()
		}
		if v, ok := doc["name"].(string); ok {
			p.Name = v
		}
		if v, ok := doc["nickname"].(string); ok {
			p.Nickname = v
		}
		if v, ok := doc["address"].(string); ok {
			p.Address = v
		}
		if v, ok := doc["status"].(string); ok {
			p.Status = v
		}
		if v, ok := doc["gender"].(string); ok {
			p.Gender = v
		}
		if v, ok := doc["phone"].(string); ok {
			p.Phone = v
		}
		if v, ok := doc["photoUrl"].(string); ok {
			p.PhotoURL = v
		}
		// birthDate may be stored as primitive.DateTime or as an ISO string
		if bd, ok := doc["birthDate"].(primitive.DateTime); ok {
			p.BirthDate = bd.Time()
		} else if bdStr, ok := doc["birthDate"].(string); ok {
			if t, err := time.Parse(time.RFC3339, bdStr); err == nil {
				p.BirthDate = t
			}
		}
		if v, ok := doc["ownedBy"].(primitive.A); ok {
			ids := []string{}
			for _, it := range v {
				switch vv := it.(type) {
				case primitive.ObjectID:
					ids = append(ids, vv.Hex())
				case string:
					ids = append(ids, vv)
				}
			}
			p.OwnedBy = ids
		}
		// owners population
		if ownersRaw, ok := doc["owners"].(primitive.A); ok {
			owners := []User{}
			for _, or := range ownersRaw {
				if m, ok := or.(bson.M); ok {
					var u User
					if idv, ok := m["_id"].(primitive.ObjectID); ok {
						u.ID = idv.Hex()
					}
					if n, ok := m["name"].(string); ok {
						u.Name = n
					}
					if un, ok := m["username"].(string); ok {
						u.Username = un
					}
					if r, ok := m["role"].(string); ok {
						u.Role = UserRole(r)
					}
					owners = append(owners, u)
				}
			}
			p.Owners = owners
		}

		// relationships population: relationships is an array of relationship docs where "toDetails" is already populated
		if relsRaw, ok := doc["relationships"].(primitive.A); ok {
			rels := []*Relationship{}
			for _, rr := range relsRaw {
				if rm, ok := rr.(bson.M); ok {
					var r Relationship
					if idv, ok := rm["_id"].(primitive.ObjectID); ok {
						r.ID = idv.Hex()
					}
					if f, ok := rm["from"].(primitive.ObjectID); ok {
						r.From = f.Hex()
					} else if fS, ok := rm["from"].(string); ok {
						r.From = fS
					}
					if t, ok := rm["to"].(primitive.ObjectID); ok {
						r.To = t.Hex()
					} else if tS, ok := rm["to"].(string); ok {
						r.To = tS
					}
					if ty, ok := rm["type"].(string); ok {
						r.Type = ty
					}
					if ord, ok := rm["order"].(int32); ok {
						r.Order = int(ord)
					}
					if tdArr, ok := rm["toDetails"].(primitive.A); ok && len(tdArr) > 0 {
						if td, ok := tdArr[0].(bson.M); ok {
							var tp Person
							if idv, ok := td["_id"].(primitive.ObjectID); ok {
								tp.ID = idv.Hex()
							}
							if n, ok := td["name"].(string); ok {
								tp.Name = n
							}
							if nick, ok := td["nickname"].(string); ok {
								tp.Nickname = nick
							}
							if address, ok := td["address"].(string); ok {
								tp.Address = address
							}
							if ph, ok := td["photoUrl"].(string); ok {
								tp.PhotoURL = ph
							}
							if bd, ok := td["birthDate"].(primitive.DateTime); ok {
								tp.BirthDate = bd.Time()
							} else if bdStr, ok := td["birthDate"].(string); ok {
								if t, err := time.Parse(time.RFC3339, bdStr); err == nil {
									tp.BirthDate = t
								}
							}
							if phn, ok := td["phone"].(string); ok {
								tp.Phone = phn
							}
							if st, ok := td["status"].(string); ok {
								tp.Status = st
							}
							if gd, ok := td["gender"].(string); ok {
								tp.Gender = gd
							}
							r.ToDetails = &tp
						}
					}
					rels = append(rels, &r)
				}
			}
			p.Relationships = rels
		}
		res = append(res, &p)
	}
	return res, nil
}

func getPersonByIdRepo(ctx context.Context, id string) (*Person, error) {
	col := MongoDB.Collection("people")
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	relPipeline := bson.A{
		bson.D{{Key: "$match", Value: bson.D{
			{Key: "$expr", Value: bson.D{{Key: "$eq", Value: bson.A{"$from", "$$pid"}}}},
			{Key: "deleted", Value: bson.D{{Key: "$ne", Value: true}}},
		}}},
		bson.D{{Key: "$lookup", Value: bson.D{{Key: "from", Value: "people"}, {Key: "localField", Value: "to"}, {Key: "foreignField", Value: "_id"}, {Key: "as", Value: "toDetails"}}}},
	}

	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.D{{Key: "_id", Value: oid}, {Key: "deleted", Value: bson.D{{Key: "$ne", Value: true}}}}}},
		bson.D{{Key: "$lookup", Value: bson.D{{Key: "from", Value: "users"}, {Key: "localField", Value: "ownedBy"}, {Key: "foreignField", Value: "_id"}, {Key: "as", Value: "owners"}}}},
		bson.D{{Key: "$lookup", Value: bson.D{{Key: "from", Value: "relationships"}, {Key: "let", Value: bson.D{{Key: "pid", Value: "$_id"}}}, {Key: "pipeline", Value: relPipeline}, {Key: "as", Value: "relationships"}}}},
		bson.D{{Key: "$project", Value: bson.D{{Key: "password", Value: 0}}}},
	}

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	if cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		var p Person
		if v, ok := doc["_id"].(primitive.ObjectID); ok {
			p.ID = v.Hex()
		}
		if v, ok := doc["name"].(string); ok {
			p.Name = v
		}
		if v, ok := doc["nickname"].(string); ok {
			p.Nickname = v
		}
		if v, ok := doc["address"].(string); ok {
			p.Address = v
		}
		if v, ok := doc["status"].(string); ok {
			p.Status = v
		}
		if v, ok := doc["gender"].(string); ok {
			p.Gender = v
		}
		if v, ok := doc["phone"].(string); ok {
			p.Phone = v
		}
		if v, ok := doc["photoUrl"].(string); ok {
			p.PhotoURL = v
		}
		// birthDate may be stored as primitive.DateTime or as an ISO string
		if bd, ok := doc["birthDate"].(primitive.DateTime); ok {
			p.BirthDate = bd.Time()
		} else if bdStr, ok := doc["birthDate"].(string); ok {
			if t, err := time.Parse(time.RFC3339, bdStr); err == nil {
				p.BirthDate = t
			}
		}
		if v, ok := doc["ownedBy"].(primitive.A); ok {
			ids := []string{}
			for _, it := range v {
				switch vv := it.(type) {
				case primitive.ObjectID:
					ids = append(ids, vv.Hex())
				case string:
					ids = append(ids, vv)
				}
			}
			p.OwnedBy = ids
		}
		if ownersRaw, ok := doc["owners"].(primitive.A); ok {
			owners := []User{}
			for _, or := range ownersRaw {
				if m, ok := or.(bson.M); ok {
					var u User
					if idv, ok := m["_id"].(primitive.ObjectID); ok {
						u.ID = idv.Hex()
					}
					if n, ok := m["name"].(string); ok {
						u.Name = n
					}
					if un, ok := m["username"].(string); ok {
						u.Username = un
					}
					if r, ok := m["role"].(string); ok {
						u.Role = UserRole(r)
					}
					owners = append(owners, u)
				}
			}
			p.Owners = owners
		}
		return &p, nil
	}
	return nil, mongo.ErrNoDocuments
}

func createPersonRepo(ctx context.Context, p *Person) (*Person, error) {
	col := MongoDB.Collection("people")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Convert ownedBy string array to ObjectID array
	ownedByOIDs := []primitive.ObjectID{}
	for _, ownerID := range p.OwnedBy {
		if oid, err := primitive.ObjectIDFromHex(ownerID); err == nil {
			ownedByOIDs = append(ownedByOIDs, oid)
		}
	}

	doc := bson.M{
		"name":      p.Name,
		"nickname":  p.Nickname,
		"address":   p.Address,
		"status":    p.Status,
		"gender":    p.Gender,
		"birthDate": p.BirthDate,
		"phone":     p.Phone,
		"photoUrl":  p.PhotoURL,
		"ownedBy":   ownedByOIDs,
	}
	res, err := col.InsertOne(ctx, doc)
	if err != nil {
		return nil, err
	}
	oid := res.InsertedID.(primitive.ObjectID)
	return getPersonByIdRepo(ctx, oid.Hex())
}

func updatePersonRepo(ctx context.Context, p *Person) (*Person, error) {
	col := MongoDB.Collection("people")
	oid, err := primitive.ObjectIDFromHex(p.ID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Convert ownedBy string array to ObjectID array
	ownedByOIDs := []primitive.ObjectID{}
	for _, ownerID := range p.OwnedBy {
		if oid, err := primitive.ObjectIDFromHex(ownerID); err == nil {
			ownedByOIDs = append(ownedByOIDs, oid)
		}
	}

	update := bson.M{"$set": bson.M{
		"name":      p.Name,
		"nickname":  p.Nickname,
		"address":   p.Address,
		"status":    p.Status,
		"gender":    p.Gender,
		"birthDate": p.BirthDate,
		"phone":     p.Phone,
		"photoUrl":  p.PhotoURL,
		"ownedBy":   ownedByOIDs,
	}}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var out Person
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": oid}, update, opts).Decode(&out); err != nil {
		return nil, err
	}
	out.ID = p.ID
	return &out, nil
}

func deletePersonRepo(ctx context.Context, id string) (*Person, error) {
	col := MongoDB.Collection("people")
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Soft delete: set deleted flag instead of removing
	update := bson.M{"$set": bson.M{"deleted": true, "deletedAt": time.Now()}}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.Before)
	var out Person
	filter := bson.M{"_id": oid, "deleted": bson.M{"$ne": true}}
	if err := col.FindOneAndUpdate(ctx, filter, update, opts).Decode(&out); err != nil {
		return nil, err
	}
	out.ID = id
	return &out, nil
}

func getAllFamiliesRepo(ctx context.Context, ownedBy []string) ([]*Family, error) {
	col := MongoDB.Collection("families")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Build match filter with soft delete
	matchFilter := bson.M{"deleted": bson.M{"$ne": true}}
	if len(ownedBy) > 0 {
		// Convert ownedBy strings to ObjectIDs for query
		ownedByOIDs := []primitive.ObjectID{}
		for _, ownerID := range ownedBy {
			if oid, err := primitive.ObjectIDFromHex(ownerID); err == nil {
				ownedByOIDs = append(ownedByOIDs, oid)
			}
		}
		if len(ownedByOIDs) > 0 {
			matchFilter["ownedBy"] = bson.M{"$in": ownedByOIDs}
		}
	}

	// Aggregation pipeline with $lookup to populate person
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: matchFilter}},
		{{Key: "$lookup", Value: bson.D{
			{Key: "from", Value: "people"},
			{Key: "localField", Value: "person"},
			{Key: "foreignField", Value: "_id"},
			{Key: "as", Value: "personDetails"},
		}}},
		{{Key: "$unwind", Value: bson.D{
			{Key: "path", Value: "$personDetails"},
			{Key: "preserveNullAndEmptyArrays", Value: true},
		}}},
	}

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	res := []*Family{}
	for cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			continue
		}
		var f Family
		if idv, ok := doc["_id"].(primitive.ObjectID); ok {
			f.ID = idv.Hex()
		}
		if n, ok := doc["name"].(string); ok {
			f.Name = n
		}
		if ob, ok := doc["ownedBy"].(primitive.A); ok {
			ids := []string{}
			for _, it := range ob {
				switch vv := it.(type) {
				case primitive.ObjectID:
					ids = append(ids, vv.Hex())
				case string:
					ids = append(ids, vv)
				}
			}
			f.OwnedBy = ids
		}

		// Populate person from personDetails
		if pd, ok := doc["personDetails"].(bson.M); ok {
			var p Person
			if idv, ok := pd["_id"].(primitive.ObjectID); ok {
				p.ID = idv.Hex()
			}
			if n, ok := pd["name"].(string); ok {
				p.Name = n
			}
			if nick, ok := pd["nickname"].(string); ok {
				p.Nickname = nick
			}
			if address, ok := pd["address"].(string); ok {
				p.Address = address
			}
			if ph, ok := pd["photoUrl"].(string); ok {
				p.PhotoURL = ph
			}
			if bd, ok := pd["birthDate"].(primitive.DateTime); ok {
				p.BirthDate = bd.Time()
			} else if bdStr, ok := pd["birthDate"].(string); ok {
				if t, err := time.Parse(time.RFC3339, bdStr); err == nil {
					p.BirthDate = t
				}
			}
			if phn, ok := pd["phone"].(string); ok {
				p.Phone = phn
			}
			if st, ok := pd["status"].(string); ok {
				p.Status = st
			}
			if gd, ok := pd["gender"].(string); ok {
				p.Gender = gd
			}
			f.Person = &p
		}

		res = append(res, &f)
	}
	return res, nil
}

func createFamilyRepo(ctx context.Context, f *Family) (*Family, error) {
	col := MongoDB.Collection("families")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Convert person ID to ObjectID for storage
	personOID, err := primitive.ObjectIDFromHex(f.Person.ID)
	if err != nil {
		return nil, err
	}

	// Convert ownedBy string array to ObjectID array
	ownedByOIDs := []primitive.ObjectID{}
	for _, ownerID := range f.OwnedBy {
		if oid, err := primitive.ObjectIDFromHex(ownerID); err == nil {
			ownedByOIDs = append(ownedByOIDs, oid)
		}
	}

	doc := bson.M{"name": f.Name, "person": personOID, "ownedBy": ownedByOIDs}
	res, err := col.InsertOne(ctx, doc)
	if err != nil {
		return nil, err
	}
	oid := res.InsertedID.(primitive.ObjectID)

	// Fetch created family with populated person using aggregation
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"_id": oid, "deleted": bson.M{"$ne": true}}}},
		{{Key: "$lookup", Value: bson.D{
			{Key: "from", Value: "people"},
			{Key: "localField", Value: "person"},
			{Key: "foreignField", Value: "_id"},
			{Key: "as", Value: "personDetails"},
		}}},
		{{Key: "$unwind", Value: bson.D{
			{Key: "path", Value: "$personDetails"},
			{Key: "preserveNullAndEmptyArrays", Value: true},
		}}},
	}

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	if !cur.Next(ctx) {
		return nil, mongo.ErrNoDocuments
	}

	var doc2 bson.M
	if err := cur.Decode(&doc2); err != nil {
		return nil, err
	}

	var out Family
	if idv, ok := doc2["_id"].(primitive.ObjectID); ok {
		out.ID = idv.Hex()
	}
	if n, ok := doc2["name"].(string); ok {
		out.Name = n
	}
	if ob, ok := doc2["ownedBy"].(primitive.A); ok {
		ids := []string{}
		for _, it := range ob {
			switch vv := it.(type) {
			case primitive.ObjectID:
				ids = append(ids, vv.Hex())
			case string:
				ids = append(ids, vv)
			}
		}
		out.OwnedBy = ids
	}

	// Populate person
	if pd, ok := doc2["personDetails"].(bson.M); ok {
		var p Person
		if idv, ok := pd["_id"].(primitive.ObjectID); ok {
			p.ID = idv.Hex()
		}
		if n, ok := pd["name"].(string); ok {
			p.Name = n
		}
		if nick, ok := pd["nickname"].(string); ok {
			p.Nickname = nick
		}
		if address, ok := pd["address"].(string); ok {
			p.Address = address
		}
		if ph, ok := pd["photoUrl"].(string); ok {
			p.PhotoURL = ph
		}
		if bd, ok := pd["birthDate"].(primitive.DateTime); ok {
			p.BirthDate = bd.Time()
		}
		if phn, ok := pd["phone"].(string); ok {
			p.Phone = phn
		}
		if st, ok := pd["status"].(string); ok {
			p.Status = st
		}
		if gd, ok := pd["gender"].(string); ok {
			p.Gender = gd
		}
		out.Person = &p
	}

	return &out, nil
}

func deleteFamilyRepo(ctx context.Context, id string) (*Family, error) {
	col := MongoDB.Collection("families")
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// First, fetch the family with populated person before deleting
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"_id": oid, "deleted": bson.M{"$ne": true}}}},
		{{Key: "$lookup", Value: bson.D{
			{Key: "from", Value: "people"},
			{Key: "localField", Value: "person"},
			{Key: "foreignField", Value: "_id"},
			{Key: "as", Value: "personDetails"},
		}}},
		{{Key: "$unwind", Value: bson.D{
			{Key: "path", Value: "$personDetails"},
			{Key: "preserveNullAndEmptyArrays", Value: true},
		}}},
	}

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	if !cur.Next(ctx) {
		return nil, mongo.ErrNoDocuments
	}

	var doc bson.M
	if err := cur.Decode(&doc); err != nil {
		return nil, err
	}

	var out Family
	if idv, ok := doc["_id"].(primitive.ObjectID); ok {
		out.ID = idv.Hex()
	}
	if n, ok := doc["name"].(string); ok {
		out.Name = n
	}
	if ob, ok := doc["ownedBy"].(primitive.A); ok {
		ids := []string{}
		for _, it := range ob {
			switch vv := it.(type) {
			case primitive.ObjectID:
				ids = append(ids, vv.Hex())
			case string:
				ids = append(ids, vv)
			}
		}
		out.OwnedBy = ids
	}

	// Populate person
	if pd, ok := doc["personDetails"].(bson.M); ok {
		var p Person
		if idv, ok := pd["_id"].(primitive.ObjectID); ok {
			p.ID = idv.Hex()
		}
		if n, ok := pd["name"].(string); ok {
			p.Name = n
		}
		if nick, ok := pd["nickname"].(string); ok {
			p.Nickname = nick
		}
		if address, ok := pd["address"].(string); ok {
			p.Address = address
		}
		if ph, ok := pd["photoUrl"].(string); ok {
			p.PhotoURL = ph
		}
		if bd, ok := pd["birthDate"].(primitive.DateTime); ok {
			p.BirthDate = bd.Time()
		}
		if phn, ok := pd["phone"].(string); ok {
			p.Phone = phn
		}
		if st, ok := pd["status"].(string); ok {
			p.Status = st
		}
		if gd, ok := pd["gender"].(string); ok {
			p.Gender = gd
		}
		out.Person = &p
	}

	// Soft delete: set deleted flag instead of removing
	update := bson.M{"$set": bson.M{"deleted": true, "deletedAt": time.Now()}}
	_, err = col.UpdateOne(ctx, bson.M{"_id": oid}, update)
	if err != nil {
		return nil, err
	}

	return &out, nil
}

func repoFindUsers(ctx context.Context, filter interface{}) ([]User, error) {
	col := MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Add soft delete filter
	var finalFilter bson.M
	if f, ok := filter.(bson.M); ok {
		finalFilter = f
		finalFilter["deleted"] = bson.M{"$ne": true}
	} else {
		finalFilter = bson.M{"deleted": bson.M{"$ne": true}}
	}

	cur, err := col.Find(ctx, finalFilter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	res := []User{}
	for cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			continue
		}
		var u User
		if idv, ok := doc["_id"].(primitive.ObjectID); ok {
			u.ID = idv.Hex()
		}
		if n, ok := doc["name"].(string); ok {
			u.Name = n
		}
		if un, ok := doc["username"].(string); ok {
			u.Username = un
		}
		if r, ok := doc["role"].(string); ok {
			u.Role = UserRole(r)
		}
		u.Password = ""
		res = append(res, u)
	}
	return res, nil
}

// Relationship repository functions
func getRelationshipsByPersonIdRepo(ctx context.Context, personId string) ([]*Relationship, error) {
	col := MongoDB.Collection("relationships")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// try to parse object id; many records may store from/to as ObjectID
	var oid primitive.ObjectID
	oidOK := false
	if o, err := primitive.ObjectIDFromHex(personId); err == nil {
		oid = o
		oidOK = true
	}

	// find relationships where from == personId (string) OR to == personId (string)
	// also include matches where from/to equal the ObjectID form
	// and exclude soft-deleted relationships
	ors := []bson.M{{"from": personId}, {"to": personId}}
	if oidOK {
		ors = append(ors, bson.M{"from": oid}, bson.M{"to": oid})
	}

	// Debug: log the query
	debug := os.Getenv("TREE_DEBUG") == "1"
	if debug {
		fmt.Printf("[STORE] getRelationshipsByPersonId: personId=%s oidOK=%v\n", personId, oidOK)
		fmt.Printf("[STORE] query: {$or: %v}\n", ors)
	}

	match := bson.D{
		{Key: "$match", Value: bson.M{
			"$or":     ors,
			"deleted": bson.M{"$ne": true},
		}},
	}

	// lookup from details
	lookupFrom := bson.D{{Key: "$lookup", Value: bson.D{{Key: "from", Value: "people"}, {Key: "localField", Value: "from"}, {Key: "foreignField", Value: "_id"}, {Key: "as", Value: "fromDetails"}}}}
	// lookup to details
	lookupTo := bson.D{{Key: "$lookup", Value: bson.D{{Key: "from", Value: "people"}, {Key: "localField", Value: "to"}, {Key: "foreignField", Value: "_id"}, {Key: "as", Value: "toDetails"}}}}

	pipeline := mongo.Pipeline{match, lookupFrom, lookupTo}

	cur, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	res := []*Relationship{}
	for cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			continue
		}
		var r Relationship
		if v, ok := doc["_id"].(primitive.ObjectID); ok {
			r.ID = v.Hex()
		}
		// Handle from field as both ObjectID and string
		if v, ok := doc["from"].(primitive.ObjectID); ok {
			r.From = v.Hex()
		} else if v, ok := doc["from"].(string); ok {
			r.From = v
		}
		// Handle to field as both ObjectID and string
		if v, ok := doc["to"].(primitive.ObjectID); ok {
			r.To = v.Hex()
		} else if v, ok := doc["to"].(string); ok {
			r.To = v
		}
		if v, ok := doc["type"].(string); ok {
			r.Type = v
		}
		if v, ok := doc["order"].(int32); ok {
			r.Order = int(v)
		}
		// fromDetails array -> take first
		if fd, ok := doc["fromDetails"].(primitive.A); ok && len(fd) > 0 {
			if m, ok := fd[0].(bson.M); ok {
				var p Person
				if idv, ok := m["_id"].(primitive.ObjectID); ok {
					p.ID = idv.Hex()
				}
				if n, ok := m["name"].(string); ok {
					p.Name = n
				}
				if nick, ok := m["nickname"].(string); ok {
					p.Nickname = nick
				}
				if address, ok := m["address"].(string); ok {
					p.Address = address
				}
				if ph, ok := m["photoUrl"].(string); ok {
					p.PhotoURL = ph
				}
				if bd, ok := m["birthDate"].(primitive.DateTime); ok {
					p.BirthDate = bd.Time()
				} else if bdStr, ok := m["birthDate"].(string); ok {
					if t, err := time.Parse(time.RFC3339, bdStr); err == nil {
						p.BirthDate = t
					}
				}
				if phn, ok := m["phone"].(string); ok {
					p.Phone = phn
				}
				if st, ok := m["status"].(string); ok {
					p.Status = st
				}
				if gd, ok := m["gender"].(string); ok {
					p.Gender = gd
				}
				r.FromDetails = &p
			}
		}
		if td, ok := doc["toDetails"].(primitive.A); ok && len(td) > 0 {
			if m, ok := td[0].(bson.M); ok {
				var p Person
				if idv, ok := m["_id"].(primitive.ObjectID); ok {
					p.ID = idv.Hex()
				}
				if n, ok := m["name"].(string); ok {
					p.Name = n
				}
				if nick, ok := m["nickname"].(string); ok {
					p.Nickname = nick
				}
				if address, ok := m["address"].(string); ok {
					p.Address = address
				}
				if ph, ok := m["photoUrl"].(string); ok {
					p.PhotoURL = ph
				}
				if bd, ok := m["birthDate"].(primitive.DateTime); ok {
					p.BirthDate = bd.Time()
				}
				if phn, ok := m["phone"].(string); ok {
					p.Phone = phn
				}
				if st, ok := m["status"].(string); ok {
					p.Status = st
				}
				if gd, ok := m["gender"].(string); ok {
					p.Gender = gd
				}
				r.ToDetails = &p
			}
		}
		res = append(res, &r)
	}

	if debug {
		fmt.Printf("[STORE] getRelationshipsByPersonId: found %d relationships\n", len(res))
		for _, r := range res {
			fmt.Printf("[STORE]   rel: from=%s to=%s type=%s\n", r.From, r.To, r.Type)
		}
	}

	return res, nil
}

func insertManyRelationshipsRepo(ctx context.Context, rels []Relationship) error {
	if len(rels) == 0 {
		return nil
	}
	col := MongoDB.Collection("relationships")
	docs := make([]interface{}, 0, len(rels))
	for _, r := range rels {
		// Convert from and to string IDs to ObjectIDs
		fromOID, errFrom := primitive.ObjectIDFromHex(r.From)
		toOID, errTo := primitive.ObjectIDFromHex(r.To)
		if errFrom != nil || errTo != nil {
			continue // Skip invalid IDs
		}
		docs = append(docs, bson.M{"from": fromOID, "to": toOID, "type": r.Type, "order": r.Order})
	}
	if len(docs) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := col.InsertMany(ctx, docs)
	return err
}

func updateRelationshipRepo(ctx context.Context, r Relationship) (*Relationship, error) {
	col := MongoDB.Collection("relationships")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Convert relationship ID to ObjectID
	id, err := primitive.ObjectIDFromHex(r.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid relationship ID")
	}

	// Convert from and to string IDs to ObjectIDs
	fromOID, errFrom := primitive.ObjectIDFromHex(r.From)
	toOID, errTo := primitive.ObjectIDFromHex(r.To)
	if errFrom != nil || errTo != nil {
		return nil, fmt.Errorf("invalid from or to ID")
	}

	filter := bson.M{"_id": id}
	update := bson.M{"$set": bson.M{"from": fromOID, "to": toOID, "type": r.Type, "order": r.Order}}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var out Relationship
	if err := col.FindOneAndUpdate(ctx, filter, update, opts).Decode(&out); err != nil {
		return nil, err
	}
	out.ID = r.ID
	return &out, nil
}

func deleteRelationshipsRepo(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	col := MongoDB.Collection("relationships")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Convert string IDs to ObjectIDs
	objIDs := []primitive.ObjectID{}
	for _, idStr := range ids {
		if oid, err := primitive.ObjectIDFromHex(idStr); err == nil {
			objIDs = append(objIDs, oid)
		}
	}
	if len(objIDs) == 0 {
		return nil
	}

	// Soft delete: set deleted flag instead of removing
	update := bson.M{"$set": bson.M{"deleted": true, "deletedAt": time.Now()}}
	_, err := col.UpdateMany(ctx, bson.M{"_id": bson.M{"$in": objIDs}}, update)
	return err
}
