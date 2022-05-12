const express = require('express');
const app = express()
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tbvme.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctor_portal').collection('services')

        app.get('/services',async(req,res)=>{
            const query = {};
            const cursor = serviceCollection.find(query)
            const services = await cursor.toArray();
            res.send(services)
        })
    }

    finally {
        // await client.close();
      }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('doctor portal is running')
})

app.listen(port, () => {
  console.log(`doctor app listening on port ${port}`)
})