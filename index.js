require('dotenv').config({ MULTILINE: true });
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const rp = require('request-promise');
const twilio = require('twilio');

const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cookieParser('gtGroupSecret'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(bodyParser.json({ type: "application/vnd.api+json" }));

app.get('/healthcheck', (req, res) => {
  res.json({
    status: 'healthy'
  })
});

app.get('/api/test', (req, res, next) => {
  client.messages.create({
    body:
      `There has been a mandatory evacuation of your area and your health center ${'NAME'}
    
Tell us where you will evacuate and we will find a health center to continue your care
`,
    to: process.env.SAMPLE_MANAGER_NUMBER,
    from: process.env.TWILIO_NUMBER
  }).then((message) => {
    console.log('twilio', message.sid, message);
    res.end()
  }).catch(next);
});


app.post('/api/response', async (req, res, next) => {
  console.log('DIALOGFLOW %j', req.body);

  // if intentName is relocation, search api
  if (req.body.result.metadata.intentName === 'relocation') {
    const { location, needs } = req.body.result.parameters;
    // geocode location to lat/long
    rp({
      uri: `https://maps.googleapis.com/maps/api/geocode/json`,
      json: true,
      qs: {
        address: location,
        key: process.env.GOOGLE_MAPS_GEOCODING_API_KEY,
      },
    }).then(({ results = [] }) => {
      const [{ formatted_address, geometry }] = results;
      // search FQHC api for appropriate locations
      return rp({
        uri: `https://findahealthcenter.hrsa.gov/healthcenters/find`,
        json: true,
        qs: {
          lat: geometry.location.lat,
          lon: geometry.location.lng,
          radius: 30, // miles
        }
      });
    }).then((healthCenters = []) => {
      // list 3, pick 1
      res.json({
        speech: `The ${'NAME'}, a FQHC has been notified of your needs and will confirm your appt. Center hours and contact if you don't hear back immediately.`
      });
    }).catch(err => {
      res.json({
        speech: `There was an error. Contact our service phone ${'NUMBER'}`
      })
    });

  }
});

app.use('/home', express.static('./client/build'));
app.get('/home/*', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'client',
      'build',
      'index.html'
    )
  )
});


app.listen(PORT, function () {
  console.log("App listening on PORT " + PORT);
});
