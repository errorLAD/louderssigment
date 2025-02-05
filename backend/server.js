const express = require('express');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

//MongoDb schema 

const eventSchema = mongoose.Schema({
    title: String,
    date: Date,
    venue: String,
    description: String,
    imageUrl: String,
    price: String,
    ticketUrl: String,
    source: String,
    lastUpdated: { type: Date, default: Date.now }
});


const Event = mongoose.model('Event', eventSchema)

//mongo scema for sub
const subscriberSchema = mongoose.Schema({
    email: { type: String, required: true, unique: true },
    optIn: { type: Boolean, default: true },
    subscribedAt: { type: Date, default: Date.now }
});

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

//scriping function 

async function scrapeEvents() { 
    const brower = await puppeteer.launch(); 
    const page = await brower.newPage(); 
    const event = [];

    try { 
        await page.goto('https://www.eventbrite.com.au/d/australia--sydney/all-events/');
        const eventbriteEvents = await page.$$eval('.eds-event-card-content', elements => 
            elements.map(el => ({ 
                title: el.querySelector('h3')?.textContent,
                date: el.querySelector('.eds-event-card-content__sub-title')?.textContent,
                venue: el.querySelector('.card-text--truncated')?.textContent,
                ticketUrl: el.querySelector('a')?.href,
                source: 'Eventbrite'
            }))
        ); 
        events.push(...eventbriteEvents);
   
      
        //scrape from on sydey
        await page.goto('https://whatson.cityofsydney.nsw.gov.au/');
        const whatsonEvents = await page.$$eval('.event-card', elements => 
           elements.map(el => ({ 
            title: el.querySelector('.event-title')?.textContent,
            date: el.querySelector('.event-date')?.textContent,
            venue: el.querySelector('.event-venue')?.textContent,
            ticketUrl: el.querySelector('a')?.href,
            source: 'WhatsOn Sydney'
           }))
        );
        events.push(...whatsonEvents);
    
        for(const event of events){ 
             await Event.findOneAndUpdate(
                {title: event.title, date: event.date}, 
                { ...event, lastUpdated: new Date()}, 
                { upsert: true}
             ); 
        }
        console.log(`sucessfully scraped ${event.lenght} events`)
    } catch(error) {
        console.error('Error scraping events:', error);
    }finally { 
        await brower.close();
    }
  
}

//api 

app.get('/api/events', async (req,res) => { 
    try { 
        const events = await Event.find()
            .sort({ date: 1 })
            .limit(100);
        res.json(events);
    } catch(error) { 
        res.status(500).json({ error: 'Failed to fetch events'})
    }
})


app.post('/api/subscribe', async ( req,res) =>  {
  try {
     const events = await Event.find()
         .sort({ date: 1})
         .limit(100)
     res.json(events);
  } catch (error) { 
    res.status(500).json({ error: 'failed to fetch events'});
  }
});

app.get('/api/subscribe', async (req,res) => { 
    try{ 
       const { email } = req.body; 
       const subscribe = new Subscriber({ email })
       await subscribe.save(); 
       res.json({ success: true, message: 'Subscription sucessful'})
    } catch (error) { 
        res.status(500).json({ error: 'Subscription failed' });
    }
})

// schedule 24 hourse

cron.schedule('0 0 * * *', () => {
    console.log('Running daily scrape...');
    scrapeEvents();
});

//start server

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        app.listen(process.env.PORT || 3000, () => {
            console.log(`Server running on port ${process.env.PORT || 3000}`);
            scrapeEvents();
        });
    })
    .catch(err => console.error('MongoDB connection error:', err));



