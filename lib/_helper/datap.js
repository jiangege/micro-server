const path = require("path");
const { ObjectId, MongoClient } = require("mongodb");
const JSONdb = require("simple-json-db");
const _ = require("lodash");
class MongoConnector {
  #url = "";
  #dbName = "";
  #mongoClient = null;
  #db = null;
  /** Create a mongodb instance
   * @param {string} url - Connect to MongoDB using a url
   * @param {string} dbName - Mongodb database name
   */
  constructor(url, dbName) {
    this.#url = url;
    this.#dbName = dbName;
  }

  /**
   * Connect to Mongodb database
   * @param {string} url  - Connect to MongoDB using a url
   * @param {string} dbName  - Mongodb database name
   */
  async connect(url, dbName) {
    this.#mongoClient = await MongoClient.connect(url ?? this.#url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
    this.#db = this.#mongoClient.db(dbName ?? this.#dbName);
  }

  /**
   *  Get the database instance
   * @param {string} [dbName] - if not passed, use the default database
   * @returns {object}
   */
  async db(dbName) {
    if (this.#mongoClient == null) {
      await this.connect();
    }
    if (dbName && this.#dbName !== dbName) {
      this.#db = this.#mongoClient.db(dbName);
      this.#dbName = dbName;
    }
    return this.#db;
  }

  async create(coll, doc) {
    const db = await this.db();
    return db.collection(coll).insertOne({
      ...doc,
    });
  }

  async createmany(coll, docs) {
    const db = await this.db();
    const result = await db.collection(coll).insertMany([...docs]);
    if (result?.insertedIds) {
      result.insertedIds = Object.values(result.insertedIds);
    }
    return result;
  }

  async readone(coll, query, sort = { _id: -1 }) {
    const db = await this.db();
    return db.collection(coll).findOne(query, {
      sort,
    });
  }
  async readid(coll, id) {
    const db = await this.db();
    return db.collection(coll).findOne(
      {
        _id: new ObjectId(id),
      },
      {
        sort: { _id: -1 },
      }
    );
  }

  /**
   * Read documents with specified conditions
   * @param {string} coll - collection name
   * @param {object} query
   * @param {number} limit
   * @param {number} skip
   * @param {number} sort
   * @returns {object[]}
   */
  async read(coll, query, limit = 0, skip = 0, sort) {
    const db = await this.db();
    return db
      .collection(coll)
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
  }

  async update(coll, doc) {
    const db = await this.db();
    const { id, ...restDoc } = doc;
    return db.collection(coll).updateOne(
      {
        _id: ObjectId(id),
      },
      {
        $set: { ...restDoc },
        $currentDate: {
          lastModified: true,
        },
      }
    );
  }

  async updatemany(coll, q, doc) {
    const db = await this.db();
    return db.collection(coll).updateMany(q, {
      $set: { ...doc },
      $currentDate: {
        lastModified: true,
      },
    });
  }

  async upsert(coll, doc) {
    const db = await this.db();
    return db.collection(coll).updateOne(
      {
        [doc["key"]]: doc[doc["key"]],
      },
      {
        $set: { ...doc },
        $currentDate: {
          lastModified: true,
        },
      },
      {
        upsert: true,
      }
    );
  }

  async delete(coll, id) {
    const db = await this.db();
    return db.collection(coll).deleteMany({
      _id: new ObjectId(id),
    });
  }

  async deletequery(coll, q) {
    const db = await this.db();
    return db.collection(coll).deleteMany(q);
  }

  async count(coll, q) {
    const db = await this.db();
    return db.collection(coll).count(q);
  }
}

class JSONConnector {
  #filePath;
  #client = null;
  constructor(filePath) {
    this.#filePath = filePath;
  }

  async connect(filePath) {
    this.#client = new JSONdb(filePath ?? this.#filePath, {
      asyncWrite: true,
    });
  }

  async db() {
    if (this.#client == null) {
      this.connect();
    }
    return this.#client;
  }

  async create(coll, doc) {
    const db = await this.db();
    let docs = db.get(coll);
    if (!Array.isArray(docs)) {
      docs = [];
    }
    docs.push({
      _id: _.uniqueId(Date.now()),
      ...doc,
    });
    db.set(coll, docs);
    db.sync();
    return;
  }

  async readone(coll, query) {
    const db = await this.db();
    const docs = db.get(coll);
    return _.chain(docs).orderBy(["_id"], ["desc"]).find(query).value();
  }

  async read(coll, query, limit, skip, sort = [["_id"], ["desc"]]) {
    const db = await this.db();
    const docs = db.get(coll);

    return _.chain(docs)
      .filter(_.isEmpty(query) ? () => true : query)
      .orderBy(...sort)
      .slice(skip ?? 0, skip + limit)
      .value();
  }

  async update(coll, query) {
    const db = await this.db();
    const docs = db.get(coll);
    const foundObj = _.find(docs, (doc) => doc._id === query.id);
    _.merge(
      foundObj,
      {
        lastModified: new Date(),
      },
      _.omit(query, "id")
    );

    db.set(coll, docs);
    db.sync();
  }

  async updatemany(coll, q, doc) {
    const db = await this.db();
    const docs = db.get(coll);

    _.filter(docs, q).forEach((d) => {
      _.merge(
        d,
        {
          lastModified: new Date(),
        },
        doc
      );
    });

    db.set(coll, docs);
    db.sync();
  }

  async upsert(coll, doc) {
    const db = await this.db();
    const docs = db.get(coll);
    const foundDoc = _.find(docs, {
      [doc["key"]]: doc[doc["key"]],
    });

    if (foundDoc) {
      _.merge(
        foundDoc,
        {
          lastModified: new Date(),
        },
        _.omit(doc, "key")
      );
    } else {
      docs.push({
        _id: _.uniqueId(Date.now()),
        ...doc,
      });
    }

    db.set(coll, docs);
    db.sync();
  }

  async delete(coll, id) {
    return this.deletequery(coll, { _id: id });
  }

  async deletequery(coll, q) {
    const db = await this.db();
    const docs = db.get(coll);
    const removedDocs = _.reject(docs, q);
    db.set(coll, removedDocs);
    db.sync();
  }

  async count(coll, q) {
    const db = await this.db();
    const docs = db.get(coll);
    return docs.length;
  }
}

module.exports = (config) => {
  return {
    mongo: new MongoConnector(config.db?.mongo),
    json: new JSONConnector(config.db?.json),
  };
};
