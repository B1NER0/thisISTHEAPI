"use strict";
const { TextAnalyticsClient, AzureKeyCredential } = require("@azure/ai-text-analytics");
const { text } = require("express");
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const e = require('express');
const { json } = require('body-parser');
const { parse } = require('path');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload')
const fs = require("fs")
const path = require('path');

const PORT = process.env.PORT || 8080;

const app = express();app.use(cors());
app.use(express.json());
app.use(fileUpload({
    createParentPath: true
}))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))

var URI = "mongodb+srv://phil:Alfadelta4@cluster0.ibqct.mongodb.net/?retryWrites=true&w=majority";
var dbo;

MongoClient.connect(URI, function(err, db) {
    if(err) throw err;
    else{
        console.log("Mongo connected successfully");        
    }   
    
    dbo = db.db("CMPG");
});

//Retrieve all users
app.get('/users', (req, res) => {
    dbo.collection("Users").find({}).toArray(function(err, result){
        if(err) throw err;
        res.send(result);
    });
})

//Authenticate user
async function authUser(theEmail, thePassword) {    
    try{
        const user  = await locateUser(theEmail);
        return user;
        
    }catch(error){
        console.log(error)
    }    
}; 

async function locateUser(theEmail) {  
   const user = await dbo.collection("Users").findOne({email: theEmail});
   return user;
}

//user login
app.post('/login', async (req, res) => {
    //Authenticate user
    const user = await authUser(req.body.email, req.body.password)

    if(user !== null)
    {
        try{
            if(await bcrypt.compare(req.body.password, user.password)){
                console.log(user);
                jwt.sign({user: user}, 'secretkey', { expiresIn: '10s'}, (err, token) => {
                    //redirect to homepage
                    res.json({
						token,
						username: user.username,
                        message: "Success"
                    })
                });            
            }else{
                res.send('Not allowed');
            }
        }

        catch{
        res.status(500).send();
        }       
    }
    else{
        res.send('Cannot find user')
    }
    
});

//Verify token
function verifyToken(req, res, next){
    //Get auth header value
    //We want ot send the token in the header
    const bearerHeader = req.headers['authorization'];
    //Check if bearer is undefined
    if(typeof bearerHeader !== 'undefined'){
        //Split at the space
        const bearer = bearerHeader.split(' ');
        //Get token from array
        const bearerToken = bearer[1];
        //Set the token
        req.token = bearerToken;

        //Call next middleware
        next();
    }
    else{
        //Forbidden
        res.sendStatus(403);
    }
}

app.get('/', (req, res) => {
	res.send("You have reached the Classification API")
})

//check if user is still actively authenticated
app.get('/auth', verifyToken, (req, res) => {
    jwt.verify(req.token, 'secretkey', (err, authData) => {
        if(err){
            res.sendStatus(403);
        }else{
            res.json({
                message: 'Success',
                authData
			})
			console.log('DONE VERIFY')
        }
    })
})

//Add new user to database with hashed password
app.post('/newUser', async (req, res) => {
    try{
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(req.body.password, salt);
        const user = {
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword
        }

        //Add user to database after hashing
        dbo.collection("Users").insertOne(user, function(err) {
            if(err) throw error;
            console.log("User added successfully");
            res.status(200).send('User added successfully');
        })        
    }catch{
        res.status(201).send("Something went wrong");
    }
});


//CLEAR uploads folder

function clearUploads() {
	fs.readdir('./uploads/', (err, files) => {
		if(err) {
			console.log('Error removing uploads content')

		};

		for(const file of files) {
			fs.unlink(path.join('./uploads/', file), err => {
				if(err){
					console.log(err);
				}
			})
		}
	})
}

//FILE UPLOAD

app.post('/upload', async (req, res) => {
    try{
        if(!req.files){
            res.send({
                status: false,
                message: 'No file uploaded'
            });
        }else{
            //Name of hte input field

            let doc = req.files.file;

            doc.mv('./uploads/' + doc.name);

            //send response
            res.send({
                status: true,
                message: 'File is uploaded',
                data: {
                    name: doc.name,
                    mimeType: doc.mimeType,
                    size: doc.size
                }
            })

            console.log('New file uploaded: ' + doc.name)
        }
    }catch(err){
        res.status(500).send(err)
    }
})

//IDENTIFICATION
app.get('/getData', (req, res) => {
    beginAnalyse(res);
})
//Identify entities from a files and send back to APPI

app.post('/sendData', (req, res) => {
   addIdentifiedData(req.body.data, req.body.uID, res)
})

function addIdentifiedData(theData, userID, res){

    try{
        const data = {
            user_id: userID,
            data: theData,
        }

        dbo.collection("classified_data").insertOne(data, function(err){
            if(err) throw err;

            console.log("Classified data added successfully to database");  
            res.status(200).send("Added to database");
        })

    }catch(err){
        console.log('Problem adding data to database');
        res.send('Problem adding to database')
    }
}

const key = '6ab597669ab74a7899073494ae9000a4';
const endpoint = 'https://classificationapi.cognitiveservices.azure.com/';

const textAnalyticsClient = new TextAnalyticsClient(endpoint,  new AzureKeyCredential(key));

var dataToSend = [];
var idNumber = [];//done blabal
var phoneNumber = [];//done
var banking = [];//
var tempQuant = [];//
var tempReligion = [];//
var tempEmail = [];//
var tempPerson = [];//
var tempLocation = [];//


var cellNumberEx = new RegExp(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im);
var cardBankingEx = new RegExp(/^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/);

var bankCardsEx = new RegExp("^4[0-9]{12}(?:[0-9]{3})?$|^(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}$|^3[47][0-9]{13}$|^3(?:0[0-5]|[68][0-9])[0-9]{11}$|^6(?:011|5[0-9]{2})[0-9]{12}$|^(?:2131|1800|35\d{3})\d{11}$");


function analyzeNumber(number){
    if(luhn_checksum(number) == 0 && number.length === 13){
        idNumber.push(number)
    }else{
        if(cellNumberEx.test(number)){
                phoneNumber.push(number)
        }else if(bankCardsEx.test(number)){
            banking.push(number)
        }
    }
}


function luhn_checksum(code) {
    var len = code.length
    var parity = len % 2
    var sum = 0
    for (var i = len-1; i >= 0; i--) {
        var d = parseInt(code.charAt(i))
        if (i % 2 == parity) { d *= 2 }
        if (d > 9) { d -= 9 }
        sum += d
    }
    return sum % 10
}



async function entityRecognition(client, textToAnalyze, res){

    const entityInputs = [textToAnalyze];
    console.log(textToAnalyze);
     //   "Here in Potchefstroom, Jack Coventry with 6011575233277578 a number an age of 18 years and Jill Huffey were both 0732436572 married Mark Johnson white males and christian and the others where muslims was going up the Hill. degenaarp@gmail.com They had an id of 9910295177084 and a number of 0739360709",
       // "I live banking 4067240822588541 at 18 Rose street Gauteng with an id of 2001014800086"];
    const entityResults = await client.recognizeEntities(entityInputs);

    //entityResults.forEach(document => {
        //if(document !== undefined){
            //console.log(`Document ID: ${document.id}`);
        //   if(document.entities !== undefined){
           //     document.entities.forEach(entity => {
            //        if(entity.text !== undefined || entity.category !== undefined){
                       // console.log(`\tName: ${entity.text} \tCategory: ${entity.category}`);
                    
             //       }
         //   })
        //}
   // }
   // });

    

    //Seperate into categories for further analysing
    
    entityResults.forEach(document => {
        //console.log("________________________________HERE")
        if(document !== undefined){
            if(document.entities !== undefined){
                document.entities.forEach(entity => {
                    if(entity.category === 'Quantity'){
                        tempQuant.push(entity.text)
                    }else if(entity.category === 'Email'){
                        tempEmail.push(entity.text);
                    }else if(entity.category === 'PersonType'){
                        tempReligion.push(entity.text);
                    }else if(entity.category === 'Person'){
                        tempPerson.push(entity.text);
                    }else if(entity.category === 'Location'){
                        tempLocation.push(entity.text);
                    }else if(entity.category === 'Address'){
                    }
                })
            }
        }else{
            return;
        }
        
    })
	console.log("--------DONE READING--------")
	startSorting(res);
}

function startSorting(res){
    
    tempQuant.forEach(num => {//analyze quantity in terms of id numbers, cell phone numbers and bank cards
        analyzeNumber(num)
	});
	
	console.log("--------DONE SORTING--------")

    sendData(res);
}

function resetArrays(){
    dataToSend = [];
    idNumber = [];//done
    phoneNumber = [];//done
    banking = [];//
    tempQuant = [];//
    tempReligion = [];//
    tempEmail = [];//
    tempPerson = [];//
    tempLocation = [];//
}

function sendData(res){
  
    dataToSend.push({Person: tempPerson}, {IDNumber: idNumber}, {Phone: phoneNumber}, {Email: tempEmail}, {Religion: tempReligion}, {Location: tempLocation}, {BankingNumber: banking})

    console.log('Finished analysing data');
   // console.log(dataToSend);
    res.send(dataToSend);
    resetArrays();
    //console.log(dataToSend);
	
	clearUploads();
}


 //Extract with Azure API and other algorithms

 function beginAnalyse(res){
    var textract = require('textract');

    var fs = require('fs');
	var files = fs.readdirSync('./uploads');
	
	if(files.length > 0){
	
    console.log('File to read: ' + files);

    textract.fromFileWithPath('./uploads/' + files[0], function(error, text) {
        try{
            entityRecognition(textAnalyticsClient, text, res);
        }
        catch(err){
            console.log(err)
        }
    
	})
	

	//clearUploads();
}
}





app.listen(PORT, () => {
    console.log("Server listening on port " + PORT);
})