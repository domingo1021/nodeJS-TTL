const express = require("express");
const axios = require("axios");
const cors = require("cors");
const redis = require("redis")
require("dotenv").config();

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true })) // for frontend form
app.use(express.json()); //for request body application json
app.use(cors()); //試試看可不可以直接拿 ec2 server 的資料

const DEFAULT_EXPIRATION = 3600

const redisClient = redis.createClient({
    socket: {
        port: process.env["REDIS_PORT"],
        host: process.env["REDIS_HOST"],
    },
    username: process.env["REDIS_USERNAME"],
    password: process.env["REDIS_PASSWORD"]
})

app.get("/init", async (req, res) => {
    await redisClient.connect()
    return res.send("Connection created.")
})

app.get("/end", async (req, res) => {
    await redisClient.quit();
    return res.send("Close redis gracefully.")
})

// 1. key value 的資料結構是啥
// 2. 一直存, 阿 Memory 炸掉怎辦？ 
// 3. key value 的資料結構是引用 hash table，好處是可以使用 key 用 O(1) 的時間找到想要的 value， 如果 collision 太多，導致搜尋時間要到 O(n)
// 4. --> 怎麼更新 --> 從誰開始更新
// 5. --> 怎麼刪 --> 從誰開始刪 ?
app.get("/setPing", async (req, res) => {
    await redisClient.connect();
    let setPing
    try {
        setPing = await redisClient.set("ping", "pong", {
            EX: 10,
            NX: true
        })
    } catch (error) {
        console.log("Set ping error: ", error)
        return res.send("Terminate due to redis set ping.")
    }
    await new Promise((resolve, reject) => {
        let x = 0
        let interval = setInterval(async () => {
            await getTTL()
            if (x > 12) {
                clearInterval(interval);
                resolve()
            }
            // if (x === 5) {
            //     await redisClient.set("ping", "pongpongpongpong", {
            //         EX: 10,
            //         NX: true
            //     })
            // }
            x += 1
        }, 999)
    })
    console.log("Demo over")
    await redisClient.quit();
    return res.json({ setping: setPing })
})

const getTTL = async () => {
    let ping = null;
    let ttl = null;
    try {
        ping = await redisClient.get("ping")
        ttl = await redisClient.ttl("ping");
    } catch (error) {
        console.log("Redis error: ", error);
    }

    console.log(ttl, ping)
    return ttl
}

app.get("/setPermanent", async (req, res) => {
    await redisClient.connect()
    await redisClient.set("hello", "hahahahaha");
    let ttl = await redisClient.ttl("hello");
    console.log("Pamanent ttl: ", ttl);
    return res.json({ data: ttl })
})


// 為什麼會這麼久？ 因次我是連 AWS 的 cache 嘻嘻， 我的 server 要沿著海底電纜 咚 咚 咚 跑到東京的 EC2 server 要上面的 cache 資料
// get campaigns.
app.get("/api/1.0/marketing/campaigns", async (req, res) => {
    await redisClient.connect();
    let campaignsResponse = undefined;
    try {
        console.log("gg")
        let campaigns = await redisClient.get("campaigns")
        if (campaigns !== null) {
            return res.json({ "campaigns": JSON.parse(campaigns) })
        } else {
            const { data } = await axios.get("http://54.248.6.0/api/1.0/marketing/campaigns")
            campaignsResponse = data.data
            redisClient.setEx("campaigns", DEFAULT_EXPIRATION, JSON.stringify(campaignsResponse));
        }
    } catch (error) {
        console.log(error)
        return res.json({ msg: "error" })
    }
    redisClient.quit();
    return res.json({ data: campaignsResponse })
})


app.listen(port, () => {
    console.log("listening at port 3000.")
})