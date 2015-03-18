
// var Client        = require('node-rest-client').Client;


// var wordfilter    = require('wordfilter');
// var request       = require('request');

var _             	= require('lodash');
var Twit          	= require('twit');
var async         	= require('async');
var mongojs 		= require('mongojs');
var wordfilter    	= require('wordfilter');

var t = new Twit({
    consumer_key:         	process.env.AUGURAPP_TWIT_CONSUMER_KEY,
    consumer_secret:      	process.env.AUGURAPP_TWIT_CONSUMER_SECRET,
    access_token:         	process.env.AUGURAPP_TWIT_ACCESS_TOKEN,
    access_token_secret:  	process.env.AUGURAPP_TWIT_ACCESS_TOKEN_SECRET
});

// var AWS = require('aws-sdk');
// AWS.config.accessKeyId = process.env.AUGURAPP_AWS_KEY;
// AWS.config.secretAccessKey = process.env.AUGURAPP_AWS_SECRET;

// var mongoUser = process.env.AUGURAPP_MONGODB_USER,
// 	monogoPass = process.env.AUGURAPP_MONGODB_PASS;

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
	// 15 for now, should be 150.
	var totalRandomSearches = 5;

	var visions = {
		allVisionsArray: [],
		tempVisionsArray: [],
		allSearchPhrasesArray: [],
		searchPhrasesArray: [],
		searchIDsArray: []
	};

	// Placeholder. Retrieve from MongoDB
	var searchPhrasesJSON = {
		"phrases" : [
			{ "searchTerm": "abandon", id: "100" },
			{ "searchTerm": "ability", id: "101" },
			{ "searchTerm": "about", id: "102" },
			{ "searchTerm": "above", id: "103" },
			{ "searchTerm": "absence", id: "104" },
			{ "searchTerm": "absent", id: "105" },
			{ "searchTerm": "absolutely", id: "106" },
			{ "searchTerm": "abuse", id: "107" },
			{ "searchTerm": "accept", id: "108" },
			{ "searchTerm": "accident", id: "109" },
			{ "searchTerm": "according", id: "110" },
			{ "searchTerm": "accurate", id: "111" },
			{ "searchTerm": "accuse", id: "112" },
			{ "searchTerm": "achieve", id: "113" },
			{ "searchTerm": "achievement", id: "114" },
			{ "searchTerm": "acquire", id: "115" },
			{ "searchTerm": "across", id: "116" },
			{ "searchTerm": "action", id: "117" },
			{ "searchTerm": "adjust", id: "118" },
			{ "searchTerm": "admire", id: "119" }
		]
	}; 

	// Convert to array
	for (var i = 0; i < searchPhrasesJSON.phrases.length; i++) {
		visions.allSearchPhrasesArray.push(searchPhrasesJSON.phrases[i]);
	};

	// Do we have enough? If not, trigger resetAll function.
	if (visions.allSearchPhrasesArray.length < totalRandomSearches) {
		resetAllSearchTerms();
		return;
	}

	// Randomly grab the total number of searches we need.
	while (totalRandomSearches > 0) {

		var randomPos = Math.floor(Math.random() * visions.allSearchPhrasesArray.length);

		// Store the phrases and IDs in their own arrays. We will update Mongo with this.
		visions.searchPhrasesArray.push(visions.allSearchPhrasesArray[randomPos].searchTerm);
		visions.searchIDsArray.push(visions.allSearchPhrasesArray[randomPos].id);

		// Remove the document we just selected. Decrement counter.
		_.pullAt(visions.allSearchPhrasesArray, randomPos);
		totalRandomSearches--;
	};

	cb(null, visions);
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
	var currentWord,
		urlEncodedPhrase = visions.searchPhrasesArray[0] + "%20AND%20";

	// Add in additional 2nd/3rd person POV phrases, forward looking. No RTs.
	urlEncodedPhrase = '%22you%20will%22%20OR%20you%27ll%20OR%20he%27ll%20OR%20she%27ll%20OR%20they%27ll%20AND%20' + urlEncodedPhrase + '-RT';

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
				// console.log(tweet);

				// Does the tweet contain offensive words?
				if (!wordfilter.blacklisted(tweet)) {			
					// For now, all we want is the text.
					// For future tracking of tweet info (author, time, geo), handle it here.
					visions.tempVisionsArray.push(data.statuses[i].text);
				}
			}

			// Do we have any search phrases left to request?
			if (visions.searchPhrasesArray.length > 0) {
				getTweets(visions, cb);
			} else {
				cb(null, visions);
			};
		} else {
			cb("There was an error retrieving posts. The word is: " + currentWord);
		}
    });
};


scrubResults = function(visions, cb) {
	console.log('--------------------------- Scrub results ---------------------------');

	console.log(visions.tempVisionsArray.length);

	var rejectionCriteriaArray = ['@', 'http', '#', '&', 'U+', 'i ', 'im ', 'i\'m', 'i\'ve ', 'ive ', 'i\'ll ', '. ill ', 'i\'d ', 'i\'da ', 'ida ', 'me ', 'my ', 'mine ', 'me', 'mine', 'lmao', 'lmfao', 'omg', 'omfg', 'smh', '&#', '%', ':)', ';)', ':p', 'oh:', 'tweet', 'we', 'we\'ll'];


	_.remove(visions.tempVisionsArray, function(n) {
		for (var i = 0; i < rejectionCriteriaArray.length; i++) {
			if (n.indexOf(rejectionCriteriaArray[i]) > -1) {
				return true;
				console.log(n);
				break;
			};

		}
	});

	console.log(visions.tempVisionsArray.length);
	console.log(visions.tempVisionsArray);


	// console.log("Total tweets: " + botData.allPosts.length);

	// for (var i = 0; i < botData.allPosts.length; i++) {
	// 	var rejected = false;
	// 	for (var j = 0; j < rejectionCriteriaArray.length; j++) {
	// 		// If there's a match with item in rejectionCriteriaArray
	// 		if (botData.allPosts[i].toLowerCase().indexOf(rejectionCriteriaArray[j]) >= 0) {
	// 			rejected = true;
	// 			break;
	// 		};
	// 	};

	// 	if (rejected) {
	// 		// Nothing
	// 	} else {
	// 		console.log("Passed!");
	// 		console.log('---------');
	// 		botData.allParsedTweets.push(botData.allPosts[i]);
	// 	}
	// }

	// if (botData.allParsedTweets.length > 0) {
	// 	cb(null, botData);

	// 	console.log("Result");
	// 	console.log("===========================");
		
	// 	for (var i = 0; i < botData.allParsedTweets.length; i++) {
	// 		console.log("> " + botData.allParsedTweets[i]);
	// 	};

	// } else {
	// 	console.log("No tweets found");
	// 	cb("No tweets beginning with \'I just want...\'");
	// }
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
		scrubResults
    ],
    function(err, botData) {
		if (err) {
			console.log('Run Error: ', err);
		}
    });
}

run();
























