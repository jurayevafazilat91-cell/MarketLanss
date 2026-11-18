import { MongoClient } from "mongodb";

const globalForMongo = globalThis;

export async function getMongoStoreCollection() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return null;

  if (!globalForMongo.mongoClientPromise) {
    // Fail in 5 s instead of the 30 s default when Atlas is unreachable (for example, an IP not on the access list).
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    globalForMongo.mongoClientPromise = client.connect().catch((error) => {
      delete globalForMongo.mongoClientPromise;
      throw error;
    });
  }

  const client = await globalForMongo.mongoClientPromise;
  const database = process.env.MONGODB_DB?.trim() || "marketplace_intelligence";
  return client.db(database).collection("app_store");
}
