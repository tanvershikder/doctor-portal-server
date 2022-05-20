const express = require('express');
const app = express()
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tbvme.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unAuthorized access" })
  }
  const token = authHeader.split(" ")[1]
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {

    if (err) {
      return res.status(403).send({ message: "forbidden access" })
    }
    req.decoded = decoded;
    next()
  });
}

// send email after booking an appointment for this function

const emailSenderOptions = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY
  }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking) {
  const { patient, patientName, date, slot, treatment } = booking;

  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your appointment for ${treatment} is booked on ${date} at ${slot} is booked`,
    text: `Your appointment for ${treatment} is booked on ${date} at ${slot} is booked`,
    html: `
    <div>
      <p>Hellow ${patientName}</p>
      <h3>Your appointment for ${treatment} is confirmed</h3>
      <p>Looking forward to seeing you on ${date} at ${slot}</p>
      <h3>Our Address</h3>
      <p>Gohin oronno bandarbon</p>
      <p>Bangladesh</p>
      <a href="https://web.programming-hero.com/">Unsubcribe</a>
    </div>
    `
  };

  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    }
    else {
      console.log('Message sent: ', info);
    }
  });

}

//send confirm email

function sendPaymentConfirmedEmail(booking) {
  const { patient, patientName, date, slot, treatment } = booking;

  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `We have received for ${treatment} is booked on ${date} at ${slot} is confirmed`,
    text: `Your payment for this ${treatment} is booked on ${date} at ${slot} is confirmed`,
    html: `
    <div>
      <p>Hellow ${patientName}</p>
      <h3>Thank you for your payment</h3>
      <h3>We have received your payment</h3>
      <p>Looking forward to seeing you on ${date} at ${slot}</p>
      <h3>Our Address</h3>
      <p>Gohin oronno bandarbon</p>
      <p>Bangladesh</p>
      <a href="https://web.programming-hero.com/">Unsubcribe</a>
    </div>
    `
  };

  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    }
    else {
      console.log('Message sent: ', info);
    }
  });

}


async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db('doctor_portal').collection('services')
    const bookingCollection = client.db('doctor_portal').collection('bookings')
    const userCollection = client.db('doctor_portal').collection('users')
    const doctorsCollection = client.db('doctor_portal').collection('doctors')
    const paymentCollection = client.db('doctor_portal').collection('payments')


    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email
      const requesterAccount = await userCollection.findOne({ email: requester })

      if (requesterAccount.role === 'admin') {
        next()
      }
      else {
        res.status(403).send({ message: "forbidden" });
      }
    }

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 })
      const services = await cursor.toArray();
      res.send(services)
    })


    //send user information in to backend i mean mongodb

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const filter = { email: email }
      const options = { upsert: true }
      const updateDoc = {
        $set: user,
      }
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET)
      res.send({ result, token })
    })

    //get all user from mongodb

    app.get('/user', verifyJWT, async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })


    
    //make user as admin
    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const filter = { email: email }
      const updateDoc = {
        $set: { role: 'admin' },
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send({ result })

    })

    // get user by its role
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email })
      const isAdmin = user.role === 'admin'
      res.send({ admin: isAdmin })
    })

    // delete an user

    app.delete('/user/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }
      const result = await userCollection.deleteOne(filter)
      res.send(result)
    })


    

    //warning
    // this is not the proper way to query
    // after lerning more mongodb ,use aggregate lookup,pipeline,mtach,group
    app.get('/available', async (req, res) => {
      const date = req.query.date || 'May 14, 2022'

      // get all service 
      const services = await serviceCollection.find().toArray();


      // get all booking on that day 
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray()

      // for each service ,find booking for that service
      services.forEach(service => {
        // find booking for that service
        const serviceBookings = bookings.filter(booking => booking.treatment === service.name);
        // select slots for the service bookings
        const booked = serviceBookings.map(service => service.slot)
        // select thats slots slots thats are not in booked
        const available = service.slots.filter(slot => !booked.includes(slot));
        service.slots = available;
      })

      res.send(services)

    })

    //get specafic user data

    app.get('/bookings', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray()
        return res.send(bookings)
      }
      else {
        return res.status(403).send({ message: 'forbidden access' })
      }

    })

    // get specipic booking by id
    app.get('/bookings/:appointmetId', verifyJWT, async (req, res) => {
      const appointmetId = req.params.appointmetId;
      const query = { _id: ObjectId(appointmetId) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking)
    })

    // post data on booking collection

    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
      const exists = await bookingCollection.findOne(query);

      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking);

      console.log("sending email");
      sendAppointmentEmail(booking)

      return res.send({ success: true, result });

    })

    // post payment on the backend and mongodb
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;   // that will convert your money poisa to taka

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount : amount,
        currency: 'usd',
        payment_method_types:['card']  
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    })

    // update bookings
    app.patch("/bookings/:id",verifyJWT,async(req,res)=>{
      const id = req.params.id;
      const payment = req.body;
      const filter = {_id : ObjectId(id)}
      const updateDoc= {
        $set:{
          paid: true,
          transactionId : payment.transactionID
        }
      }
      const result = await paymentCollection.insertOne(payment);
      const updateBookings = await bookingCollection.updateOne(filter,updateDoc)

      console.log("sending email");
      sendPaymentConfirmedEmail(payment.appointment)

      res.send(updateBookings)
    })

    // send doctor iformation to the server and mongodb
    app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor)
      res.send(result);
    })

    //get all doctor
    app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorsCollection.find().toArray();
      res.send(doctors)
    })

    //delete doctor
    app.delete('/doctors/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }
      const result = await doctorsCollection.deleteOne(filter)
      res.send(result)
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