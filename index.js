const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;



app.use(cors());
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.c3txqlb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, nest) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access')
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(403).send('forbiden access')
        }
        req.decoded = decoded;
        nest();
    })

}







async function run() {
    try {

        const appointmentOptonsCollection = client.db('doctorsPortal').collection('appointmentCollection')
        const bookingCollection = client.db('doctorsPortal').collection('bookings')
        const usersCollection = client.db('doctorsPortal').collection('users')
        const doctorsCollection = client.db('doctorsPortal').collection('doctors')

        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send('forbiden access')
            }
            next()
        }

        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date
            console.log(date)
            const quary = {}
            const options = await appointmentOptonsCollection.find(quary).toArray()
            // carefully
            const bookingQuery = { selectedDate: date }
            const allreadybooked = await bookingCollection.find(bookingQuery).toArray()
            options.forEach(option => {
                const optionBooked = allreadybooked.filter(book => book.treatment === option.name)
                const bookslots = optionBooked.map(book => book.slot)
                const remaning = option.slots.filter(slot => !bookslots.includes(slot))
                console.log(option.name, bookingQuery, remaning.length)
                option.slots = remaning
            })
            res.send(options)
        })

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await bookingCollection.findOne(query)
            res.send(result)
        })

        // app.get('/v2/appointmentOptions', async (req, res) => {
        //     const date = req.query.date;
        //     const opions = await bookingCollection.aggregate([
        //         {
        //             $lookup: {
        //                 form: 'booking',
        //                 localField: 'name',
        //                 foreignField: 'treatment',
        //                 pipline: [
        //                     {
        //                         $match: {
        //                              $expr: {
        //                                 $eq: [
        //                                     'selectedDate', date
        //                                 ]
        //                             }
        //                         }
        //                     }
        //                 ],
        //                 as: 'booked'
        //             }
        //         },
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: 1,
        //                 booked: {
        //                     $map: {
        //                         input: '$booked',
        //                         as: 'book',
        //                         in: '$$book.slot'
        //                     }
        //                 }
        //             }
        //         },
        //         {
        //             $project: {
        //                 name: 1,
        //                 slot: {
        //                     $setDiffrence: ['$slots', '$booked']
        //                 }
        //             }
        //         }
        //     ]).toArray()
        //     res.send(opions)
        // })

        /* 
        bookings
        */

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send('forbiden access')
            }
            const query = { email: email };
            const bookings = await bookingCollection.find(query).toArray()
            res.send(bookings);
        })


        app.post('/bookings', async (req, res) => {
            const booking = req.body
            const query = {
                selectedDate: booking.selectedDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked = await bookingCollection.find(query).toArray()
            if (alreadyBooked.length) {
                const message = `you already have a booking on ${booking.selectedDate}`
                return res.send({ acknoladged: false, message })
            }
            const result = await bookingCollection.insertOne(booking)
            res.send(result)
        })


        // middleware

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '12hr' })
                return res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: '' })
        })



        // users
        app.get('/users', async (req, res) => {
            const query = {}
            const users = await usersCollection.find(query).toArray()
            res.send(users)
        })


        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })


        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === 'admin' })
        })


        app.put('users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, option);
            res.send(result)
        })


        app.get('/addPrice', async (req, res) => {
            const filter = {}
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    price: 900
                }
            }
            const result = await appointmentOptonsCollection.updateMany(filter, updatedDoc, options)
            res.send(result)
        })


        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptonsCollection.find(query).project({ name: 1 }).toArray()
            res.send(result)
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const doctors = await doctorsCollection.find(query).toArray()
            res.send(doctors)
        })

        app.post('/doctors', verifyJWT, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result)
        })

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const result = await doctorsCollection.deleteOne(filter)
            res.send(result)
        })

    }
    finally {

    }
}

run().catch(console.log())

app.get('/', (req, res) => {
    res.send('Doctors Portal Server')
})

app.listen(port, () => {
    console.log(`Server is running at ${port}`)
})