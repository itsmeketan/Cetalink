require('dotenv').config(); 
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const mongoose = require("mongoose");

const User = require("./models/user.js");

const openAiApiKey = process.env.OPENAI_API_KEY;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;


const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});







app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());


app.get("/",(req,res)=>{
    res.render("home.ejs")
});


app.get("/signup",(req,res)=>{
    res.render("signup.ejs");
});

app.post("/signup",(req,res)=>{
    let {username , email, password}= req.body;
    let newUser = new User ({
        username : username,
        email : email,
        password : password
    });

    newUser.save()
    .then((result)=>{
        let _id =result._id;
        res.send(`
    <script>
      alert("Signup Sucessfull.");
      window.location.href = "/${_id}/symptom"; 
    </script>
    `);
    })
    .catch((err)=>{
        res.send(`
    <script>
      alert("Error : ${err.body}");
      window.location.href = "/"; 
    </script>
    `);
    });
    
});

app.get("/login",(req,res)=>{
    res.render("login.ejs");
});

app.post("/login",async (req,res)=>{
    let {username , password}= req.body;
    try{
        let userdb = await User.findOne({username : username });
        if(userdb){
            let db_user_pass = userdb.password;
            let _id = userdb._id;
        if(db_user_pass === password){
            res.send(`
                <script>
                  alert("Login Sucessfull ${username}");
                  window.location.href = "/${_id}/symptom"; 
                </script>
                `);
        }
        else{
            res.send(`
                <script>
                  alert("Incorrect Password.");
                  window.location.href = "/login";
                </script>
                `);
        }
    }
        else{
            res.send(`
                <script>
                  alert("User : ${username} is not present.");
                  window.location.href = "/login"; 
                </script>
                `);
        
        }
        
    }
    catch(err){
        res.send(`
            <script>
              alert("Error : ${err}");
              window.location.href = "/login"; 
            </script>
            `);
    }
   
    
});

app.get('/:_id/symptom', async (req, res) => {
    let{_id}= req.params;
    res.render('symptom.ejs', {_id});
});


app.post('/:_id/submit-symptoms', async (req, res) => {
    const { primarySymptom, secondarySymptom } = req.body;
    let {_id}= req.params;

    try {
        
        const followUpQuestionsRequest = {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are a helpful medical assistant.' },
                { role: 'user', content: `Based on the symptoms: ${primarySymptom} and ${secondarySymptom}, generate 5-10 follow-up diagnostic questions.Generate only questions and nothing more.Keep the length of questions as less as possible.` },
            ],
        };

        const followUpQuestionsResponse = await axios.post('https://api.openai.com/v1/chat/completions', followUpQuestionsRequest, {
            headers: {
                'Authorization': `Bearer ${openAiApiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const followUpQuestions = followUpQuestionsResponse.data.choices[0].message.content.split('\n');

        res.render('questions', {
            questions: followUpQuestions,
            primarySymptom,
            secondarySymptom,
            _id
        });
    } catch (error) {
        console.error('Error generating follow-up questions:', error);
        res.send('An error occurred while processing your request.');
    }
});


app.post('/:_id/final-diagnosis', async (req, res) => {
    let{_id} = req.params;
    const { answers, primarySymptom, secondarySymptom, questions } = req.body;

    try {
        const openAiRequest = {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are a helpful medical assistant.' },
                { role: 'user', content: `Given symptoms: ${primarySymptom}, ${secondarySymptom}, questions : ${questions} and answers: ${answers.join(',')}, what is the three most probable disease? Give only two/ three names in array format` },
            ],
        };

        const openAiResponse = await axios.post('https://api.openai.com/v1/chat/completions', openAiRequest, {
            headers: {
                'Authorization': `Bearer ${openAiApiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const mostProbableDisease = openAiResponse.data.choices[0].message.content;
        

        res.render('results', {
            diseases: mostProbableDisease, _id
        });
    } catch (error) {
        console.error('Error fetching final diagnosis:', error);
        res.send('An error occurred.');
    }
});


app.post('/:_id/hospitals', async (req, res) => {
    let{_id}= req.params;
    const { city, latitude, longitude , diseases} = req.body;
    console.log(diseases);
    let hospitals = [];

    try {
        if (latitude && longitude) {
            hospitals = await getHospitalsByCoordinates(latitude, longitude,diseases);
        } else {
            hospitals = await getHospitalsByCity(city,diseases);
        }

        res.render('hospitals', { hospitals, _id });
    } catch (error) {
        console.error('Error fetching hospitals:', error.message);
        res.render('hospitals', { hospitals: [] });
    }
});

async function getHospitalsByCity(city, diseases) {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=hospitals+in+${city}&key=${googleMapsApiKey}`;

    try {
        const response = await axios.get(url);

        
        return response.data.results.map((hospital) => ({
            name: hospital.name,
            address: hospital.formatted_address,
            place_id: hospital.place_id, 
        }));

    } catch (error) {
        console.error('Error fetching hospitals:', error.message);
        return [];
    }
}

async function getHospitalsByCoordinates(lat, lng) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=hospital&key=${googleMapsApiKey}`;

    try {
        const response = await axios.get(url);

        const hospitalsWithDistance = response.data.results.map((hospital) => {
            const hospitalLat = hospital.geometry.location.lat;
            const hospitalLng = hospital.geometry.location.lng;
            const distance = calculateDistance(lat, lng, hospitalLat, hospitalLng);

            return {
                name: hospital.name,
                address: hospital.vicinity,
                place_id: hospital.place_id,  
                distance: distance
            };
        });

        hospitalsWithDistance.sort((a, b) => a.distance - b.distance);

        return hospitalsWithDistance.map(hospital => ({
            name: hospital.name,
            address: hospital.address,
            place_id: hospital.place_id,  
        }));

    } catch (error) {
        console.error('Error fetching hospitals:', error.message);
        return [];
    }
}


function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; 
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}



app.get('/hospital/:place_id/details', async (req, res) => {
    const { place_id } = req.params;
    let hospitalDetails = {};

    try {
        
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        const response = await axios.get(url);
        hospitalDetails = response.data.result;

        
        res.render('hospital-details', {
            hospital: hospitalDetails,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
    } catch (error) {
        console.error('Error fetching hospital details:', error.message);
        res.render('hospital-details', { hospital: {}, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY });
    }
});


async function getHospitalDetails(place_id) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${googleMapsApiKey}`;

    try {
        const response = await axios.get(url);
        const hospital = response.data.result;

        return {
            name: hospital.name,
            address: hospital.formatted_address,
            phone: hospital.formatted_phone_number,
            website: hospital.website,
            rating: hospital.rating,
            reviews: hospital.user_ratings_total,
            photo: hospital.photos ? hospital.photos[0].photo_reference : null, 
        };
    } catch (error) {
        console.error('Error fetching hospital details:', error.message);
        return {};
    }
}




app.get('/medicals', (req, res) => {
    res.render('medicals.ejs'); 
});


app.post('/medicals', async (req, res) => {
    const { city, latitude, longitude } = req.body;
    let medicals = [];

    try {
        if (latitude && longitude) {
            
            medicals = await getMedicalsByCoordinates(latitude, longitude);
        } else if (city) {
        
            medicals = await getMedicalsByCity(city);
        }

        
        res.render('medicals-results', { medicals });
    } catch (error) {
        console.error('Error fetching medicals:', error.message);
        res.render('medicals-results', { medicals: [] });
    }
});




app.post('/medicals', async (req, res) => {
    const { city, latitude, longitude } = req.body;
    let medicals = [];

    try {
        if (latitude && longitude) {
            
            medicals = await getMedicalsByCoordinates(latitude, longitude);
        } else if (city) {
            
            medicals = await getMedicalsByCity(city);
        }

        console.log(medicals);
        
        res.render('medicals-results', { medicals });
    } catch (error) {
        console.error('Error fetching medicals:', error.message);
        res.render('medicals-results', { medicals: [] });
    }
});


async function getMedicalsByCoordinates(lat, lng) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=pharmacy&key=${googleMapsApiKey}`;
    try {
        const response = await axios.get(url);
        const medicalsWithDistance = response.data.results.map((medical) => {
            const medicalLat = medical.geometry.location.lat;
            const medicalLng = medical.geometry.location.lng;
            const distance = calculateDistance(lat, lng, medicalLat, medicalLng);
            return {
                name: medical.name,
                address: medical.vicinity,
                place_id: medical.place_id, 
                distance: distance,
            };
        });

        

        
        medicalsWithDistance.sort((a, b) => a.distance - b.distance);
        return medicalsWithDistance.map((medical) => ({
            name: medical.name,
            address: medical.address,
            place_id: medical.place_id,  
        }));
    } catch (error) {
        console.error('Error fetching medicals by coordinates:', error.message);
        return [];
    }
}
async function getMedicalsByCity(city) {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=pharmacies+in+${encodeURIComponent(city)}&key=${googleMapsApiKey}`;
    
    try {
        const response = await axios.get(url);
        const medicalsWithDistance = response.data.results.map((medical) => ({
            name: medical.name,
            address: medical.formatted_address,
            place_id: medical.place_id, 
        }));

        return medicalsWithDistance;
    } catch (error) {
        console.error('Error fetching medicals by city:', error.message);
        return [];
    }
}


app.get('/medicals/details/:placeId', async (req, res) => {
    const { placeId } = req.params;

    try {
        const medicalDetails = await getMedicalShopDetailsByPlaceId(placeId);
        res.render('medical-shop-details', { details: medicalDetails });
    } catch (error) {
        console.error('Error fetching medical shop details:', error.message);
        res.redirect('/medicals');  
    }
});



async function getMedicalShopDetailsByPlaceId(placeId) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?placeid=${placeId}&key=${googleMapsApiKey}`;
    
    try {
        const response = await axios.get(url);
        const place = response.data.result;
        
        return {
            name: place.name,
            address: place.formatted_address,
            phone_number: place.formatted_phone_number || 'Not available',
            website: place.website || 'Not available',
            rating: place.rating || 'No rating',
            reviews: place.reviews || []
        };
    } catch (error) {
        console.error('Error fetching pharmacy details:', error.message);
        return null;
    }
}


app.get('/pathology', (req, res) => {
    res.render('patho.ejs'); 
});