// var Client        = require('node-rest-client').Client;
// var request       = require('request');

var _             	= require('lodash');
var Twit          	= require('twit');
var async         	= require('async');
var mongojs 		= require('mongojs');
var wordfilter    	= require('wordfilter');
var levenshtein 	= require('fast-levenshtein');

var t = new Twit({
    consumer_key:         	process.env.AUGURAPP_TWIT_CONSUMER_KEY,
    consumer_secret:      	process.env.AUGURAPP_TWIT_CONSUMER_SECRET,
    access_token:         	process.env.AUGURAPP_TWIT_ACCESS_TOKEN,
    access_token_secret:  	process.env.AUGURAPP_TWIT_ACCESS_TOKEN_SECRET
});

// var AWS = require('aws-sdk');
// AWS.config.accessKeyId = process.env.AUGURAPP_AWS_KEY;
// AWS.config.secretAccessKey = process.env.AUGURAPP_AWS_SECRET;

var mongoUser = process.env.AUGURAPP_MONGODB_USER,
	mongoPass = process.env.AUGURAPP_MONGODB_PASS,
	mongoURI = "mongodb://" + mongoUser + ":" + mongoPass + "@ds061747.mongolab.com:61747/augur-db";


// var uri = "mongodb://mongoUser:monogoPass@ds061747.mongolab.com:61747/augur-db",
//     db = mongojs.connect(uri);

// db.on('error',function(err) {
//     console.log('database error', err);
// });
 
// db.on('ready',function() {
//     console.log('database connected');
// });






// ===========================
// Get Search Phrases
// ===========================
retrieveSearchPhrases = function(cb) {
	console.log('--------------------------- Retreieve search phrases ---------------------------');

	var visions = {
		totalRandomSearches: 3,			// Keep polling Twitter for X number of search phrases. Low for testing, should be ~180
		maxArraySize: 750,				// When allVisionsArray reaches this size, push to Mongo before clearing/resuming.
		levenshteinThreshold: 25,		// Levenshtein threshold, to avoid similar strings.
		allVisionsArray: [],			// List of visions, before uploading to Mongo
		tempVisionsArray: [],			// Placeholder array, for parsing
		allSearchPhrasesArray: [],		// Full list of search phrase data from Mongo
		searchPhrasesArray: [],			// Just the phrases, randomly selected from allSearchPhrasesArray
		searchIDsArray: []				// Just the Mongo IDs
	};

	// Mongo: Query data from searchStrings collection
	// Consider: searchPhrasesArray, searchIDsArray - unnecessary?
	var db = mongojs(mongoURI),
		searchStringsDBC = db.collection('searchStrings'),
		searchPhrasesJSON = {};
	
		searchStringsDBC.find({ status: "new" }).limit(5, 
			function(err, docs) {
				if (!err) {
					console.log("Mongo: searchStrings docs retrieved!");
					searchPhrasesJSON = docs;
					processSearchStrings();
					db.close();
				} else {
					console.log("Error retrieving data from searchStrings Collection");
				}
			}
		);

	
	processSearchStrings = function() {
		console.log('--------- Process search strings ---------');

		// Convert to array
		for (var i = 0; i < searchPhrasesJSON.length; i++) {
			visions.allSearchPhrasesArray.push(searchPhrasesJSON[i]);
		};

		// Do we have enough? If not, trigger resetAll function.
		// Insert fake values here to force/test reset.
		if (visions.allSearchPhrasesArray.length < visions.totalRandomSearches) {
			resetAllSearchTerms();
			return;
		}

		// Randomize the array
		visions.allSearchPhrasesArray = _.shuffle(visions.allSearchPhrasesArray);

		// Randomly grab the total number of searches we need.
		while (visions.totalRandomSearches > 0) {
			console.log("visions.totalRandomSearches: " + visions.totalRandomSearches);
			
			// Store the phrases and IDs in their own arrays. We will update Mongo with this.
			visions.searchPhrasesArray.push(visions.allSearchPhrasesArray[0].searchTerm);
			visions.searchIDsArray.push(visions.allSearchPhrasesArray[0].id);

			// Remove the document we just selected. Decrement counter.
			// _.pullAt(visions.allSearchPhrasesArray, randomPos);
			visions.allSearchPhrasesArray.shift();
			visions.totalRandomSearches--;
		};

		console.log('arrived here');

		cb(null, visions);
	}

	
	
	// var searchPhrasesJSON = {
	// 	"phrases" : [
	// 		{ "searchTerm": "abandon", id: "100" },
	// 		{ "searchTerm": "ability", id: "101" },
	// 		{ "searchTerm": "about", id: "102" },
	// 		{ "searchTerm": "above", id: "103" },
	// 		{ "searchTerm": "absence", id: "104" },
	// 		{ "searchTerm": "absent", id: "105" },
	// 		{ "searchTerm": "absolutely", id: "106" },
	// 		{ "searchTerm": "abuse", id: "107" },
	// 		{ "searchTerm": "accept", id: "108" },
	// 		{ "searchTerm": "accident", id: "109" },
	// 		{ "searchTerm": "according", id: "110" },
	// 		{ "searchTerm": "accurate", id: "111" },
	// 		{ "searchTerm": "accuse", id: "112" },
	// 		{ "searchTerm": "achieve", id: "113" },
	// 		{ "searchTerm": "achievement", id: "114" },
	// 		{ "searchTerm": "acquire", id: "115" },
	// 		{ "searchTerm": "across", id: "116" },
	// 		{ "searchTerm": "action", id: "117" },
	// 		{ "searchTerm": "adjust", id: "118" },
	// 		{ "searchTerm": "admire", id: "119" }
	// 	]
	// }; 



}

// ===========================
// Reset All Search Terms
// ===========================
resetAllSearchTerms = function() {
	console.log('--------------------------- Reset all search terms ---------------------------');
	// We've exhausted the list!
	// set all DB documents to status = "new"
	// Start over and retrieve docs again
	console.log('Reset all search terms!');
}


// ===========================
// Update DB IDs
// 
// ===========================
updateDBIDs = function(visions, cb) {
	console.log('--------------------------- Update database IDs ---------------------------');
	// Create JSON, send to MongoDB
	// update based on IDs in searchStrings Collection, mark status as "used"

	cb(null, visions);
}


// ===========================
// Twitter Search
// ===========================
getTweets = function(visions, cb) {
	console.log('--------------------------- Get tweets ---------------------------');

	// Grab first tweet from visions.searchPhrasesArray
	var currentWord = visions.searchPhrasesArray[0],
		urlEncodedPhrase = visions.searchPhrasesArray[0] + "%20AND%20";

	console.log("currentWord: " + currentWord);

	// Add in additional 2nd/3rd person POV phrases, forward looking. No RTs.
	// urlEncodedPhrase = '%22you%20will%22%20OR%20you%27ll%20OR%20he%27ll%20OR%20she%27ll%20OR%20they%27ll%20AND%20' + urlEncodedPhrase + '-RT';

	urlEncodedPhrase = '%22you%20will%22OR%22you%27ll%22OR%22you%20should%22OR%22you%20may%22OR%22you%20might%22OR%22you%27d%20better%22OR%22you%20ought%20to%22' + urlEncodedPhrase + '-RT';

	// Remove first element from array
	visions.searchPhrasesArray.shift();

	// Randomize result type preference (mixed, recent, popular)
	var coinToss = Math.floor(Math.random() * 100) + 1;
	if ((coinToss%4) != 0) {
	    var resultTypePreference = 'recent';
	} else {
	    var resultTypePreference = 'popular';
	};

    t.get('search/tweets', {
    	q: urlEncodedPhrase,
    	count: 100, 
    	result_type: resultTypePreference, 
    	lang: 'en',
    	include_entities: 'false'
    	}, 

    	function(err, data, response) {
		if (!err) {
			// Loop through all returned statuses
			for (var i = 0; i < data.statuses.length; i++) {
				var tweet = data.statuses[i].text.toLowerCase();
				// Does the tweet contain offensive words?
				if (!wordfilter.blacklisted(tweet)) {			
					// For now, all we want is the text.
					// For future tracking of tweet info (author, time, geo), handle it here.
					visions.tempVisionsArray.push(data.statuses[i].text);
				}
			}
			scrubResults(visions, cb);
		} else {
			cb("There was an error retrieving posts. The word is: " + currentWord);
		}
    });
};


scrubResults = function(visions, cb) {
	console.log('--------------------------- Scrub results ---------------------------');

	console.log("Before: " + visions.tempVisionsArray.length);

	var rejectionCriteriaArray = ['@', 'http', '#', '&', 'U+', 'i ', 'im ', 'i\'m', 'i\'ve ', 'ive ', 'i\'ll ', '. ill ', 'i\'d ', 'i\'da ', 'ida ', 'me ', 'my ', 'mine ', 'me', 'mine', 'lmao', 'lmfao', 'omg', 'omfg', 'smh', '&#', '%', ':)', ';)', ':p', 'oh:', 'tweet', 'we', 'we\'ll'];

	visions.tempVisionsArray = _.uniq(visions.tempVisionsArray);

	_.remove(visions.tempVisionsArray, function(n) {
		for (var i = 0; i < rejectionCriteriaArray.length; i++) {
			n = n.replace('\\\'', '\'');
			if (n.toLowerCase().indexOf(rejectionCriteriaArray[i]) > -1) {
				return true;
				console.log(n);
				break;
			};

		}
	});

	console.log("After: " + visions.tempVisionsArray.length);

	// Iterate through temp array
	for (var i = 0; i < visions.tempVisionsArray.length; i++) {
		// Check if allVisionsArray has any data
		if (visions.allVisionsArray.length > 0) {
			var isOriginal = true;
			for (var j = 0; j < visions.allVisionsArray.length; j++) {
				var distance = levenshtein.get(visions.tempVisionsArray[i].toLowerCase(), visions.allVisionsArray[j].toLowerCase());
				// If we find a too-similar match, exit out
				if (distance < visions.levenshteinThreshold) {
					console.log("Applicant: " + visions.tempVisionsArray[i]);
					console.log("Existing: " + visions.allVisionsArray[j]);
					isOriginal = false;
					break; 
				}
			};
			// Original? Add.
			if (isOriginal) {
				visions.allVisionsArray.push(visions.tempVisionsArray[i]);
			}
		} else {
			visions.allVisionsArray.push(visions.tempVisionsArray[i])
		};
	};

	arrayCheckReset(visions, cb);
}


arrayCheckReset = function(visions, cb) {
	console.log('--------------------------- Array Check/Reset ---------------------------');

	// Is our array too large? 
	if (visions.allVisionsArray.length < visions.maxArraySize) {
		if (visions.searchPhrasesArray.length > 0) {
			// Clear tempVisionsArray.
			visions.tempVisionsArray = [];
			getTweets(visions, cb);
		} else {
			cb(null, visions);
		};
	// It's too large. Let's push content up to our MongoDB.
	} else {
		// Upload data to Mongo
		// Reset vars

		// on success, 
		// getTweets(visions, cb);
	}
}


testFunction = function(visions, cb) {
	console.log('--------------------------- Test Function ---------------------------');
	
	for (var i = 0; i < visions.allVisionsArray.length; i++) {
		console.log(visions.allVisionsArray[i]);
	};
}






// ===========================
// Mongo Testing
// ===========================
mongoTest = function() {
	// Connect to DB
	var db = mongojs(mongoURI),
		searchStringsDBC = db.collection('searchStrings'),
		searchPhrasesJSON = {};
	
		searchStringsDBC.find({ status: "new" }).limit(5, 
			function(err, docs) {
				if (!err) {
					console.log("Mongo: searchStrings docs retrieved!");
					// console.log(JSON.stringify(docs));
					var bob = docs;
					console.log(typeof bob);
					console.log(bob);

					db.close();


				} else {
					console.log("Error retrieving data from searchStrings Collection");
				}
			}
		);
}







// ===========================
// Execute
// ===========================
run = function() {
	console.log('--------------------------- Starting ---------------------------');

    async.waterfall([
		retrieveSearchPhrases,
		updateDBIDs,
		getTweets,
		// scrubResults,
		testFunction		

    ],
    function(err, botData) {
		if (err) {
			console.log('Run Error: ', err);
		}
    });
}

run();

// mongoTest();
























