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

var mongoUser = process.env.AUGURAPP_MONGODB_USER,
	mongoPass = process.env.AUGURAPP_MONGODB_PASS,
	mongoURI = "mongodb://" + mongoUser + ":" + mongoPass + "@ds061747.mongolab.com:61747/augur-db";

var db = mongojs(mongoURI),
	searchStringsDBC = db.collection('searchStrings'),
	twitterStorageDBC = db.collection('twitterStorage');

// ===========================
// Init
// ===========================
augurInit = function(cb) {
	
	// Consider: searchPhrasesArray, searchIDsArray - unnecessary?
	var visions = {
		totalRandomSearches: 3,			// Counter. Keep polling Twitter for X number of search phrases. Low for testing, should be ~180
		maxArraySize: 30,				// When allVisionsArray reaches this size, push to Mongo before clearing/resuming.
		levenshteinThreshold: 25,		// Levenshtein distance, to avoid similar strings.
		allVisionsArray: [],			// List of visions, before uploading to Mongo
		tempVisionsArray: [],			// Placeholder array, for parsing
		allSearchPhrasesArray: [],		// Full list of search phrase data from Mongo
		searchPhrasesArray: [],			// Just the phrases, randomly selected from allSearchPhrasesArray
		searchIDsArray: []				// Just the Mongo IDs
	};

	cb(null, visions);
}


// resetVisions = function(visions) {
// 	visions.totalRandomSearches = 5;
// 	visions.tempVisionsArray = [];
// 	visions.searchPhrasesArray = [];
// 	visions.searchIDsArray = [];
// }


// ===========================
// Get Search Phrases
// ===========================
retrieveSearchPhrases = function(visions, cb) {
	console.log('--------------------------- Retrieve search phrases ---------------------------');

	var searchPhrasesJSON = {};

	// Mongo: Query data from searchStrings collection
	searchStringsDBC.find({ status: "new" }, 
		function(err, docs) {
			if (!err) {
				console.log("Mongo: searchStrings docs retrieved! Total: " + docs.length);
				searchPhrasesJSON = docs;

				cb(null, visions, searchPhrasesJSON);
			} else {
				console.log("Error retrieving data from searchStrings Collection");
			}
		}
	);
}



processSearchStrings = function(visions, searchPhrasesJSON, cb) {
	console.log('--------------------------- Processing search strings ---------------------------');	

	// Convert to array
	for (var i = 0; i < searchPhrasesJSON.length; i++) {
		visions.allSearchPhrasesArray.push(searchPhrasesJSON[i]);
	};

	// Do we have enough? If not, trigger resetAll function.
	// Insert fake values here to force/test reset.
	// if (visions.allSearchPhrasesArray.length < visions.totalRandomSearches) {
	if (visions.allSearchPhrasesArray.length < 1300) {
		console.log("Not enough left. Time to reset!");
		resetAllSearchTerms(visions);
		return;
	};

	// Randomize the array
	// Well, not yet. Let's leave it be for now.
	// visions.allSearchPhrasesArray = _.shuffle(visions.allSearchPhrasesArray);

	// Randomly grab the total number of searches we need.
	while (visions.totalRandomSearches > 0) {
		// Store the phrases and IDs in their own arrays. We will update Mongo with this.
		visions.searchPhrasesArray.push(visions.allSearchPhrasesArray[0].searchTerm);
		visions.searchIDsArray.push(visions.allSearchPhrasesArray[0]._id);

		// Remove the document we just selected. Decrement counter.
		visions.allSearchPhrasesArray.shift();
		visions.totalRandomSearches--;
	};

	console.log("visions.searchPhrasesArray: " + visions.searchPhrasesArray);

	cb(null, visions);
}


// ===========================
// Reset All Search Terms
// ===========================
resetAllSearchTerms = function(visions) {
	console.log('--------------------------- Reset all search terms ---------------------------');
	// We've exhausted the list!
	// set all DB documents to status = "new"
	// Start over and retrieve docs again

	// var searchStringsDBC = db.collection('searchStrings');

	searchStringsDBC.update( 
		{ _id : { $exists: true } },
	  	{ $set: { status : "new" } },
	  	{ multi: true }, function() {
	  		console.log('Reset completed!');
			
			// Start it all over again!
			searchBegin();
	  	}
	);

	console.log('Reset all search terms!');
}


// ===========================
// Update DB IDs
// ===========================
updateDBIDs = function(visions, cb) {
	console.log('--------------------------- Update database IDs ---------------------------');
	// Create JSON, send to MongoDB
	// update based on IDs in searchStrings Collection, mark status as "used"

	// console.log(visions.searchPhrasesArray);
	// console.log(visions.searchIDsArray);
	
	// var searchStringsDBC = db.collection('searchStrings');

	searchStringsDBC.update( 
		{ _id : { $in: visions.searchIDsArray } },
	  	{ $set: { status : "used" } },
	  	{ multi: true }, function() {
	  		console.log('Updates complete!');
			cb(null, visions);
	  	}
	);
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
					// console.log("Applicant: " + visions.tempVisionsArray[i]);
					// console.log("Existing: " + visions.allVisionsArray[j]);
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

	console.log("Current/Max Visions: " + visions.allVisionsArray.length + "/" + visions.maxArraySize);

	// Check if our allVisionsArray is too large
	// If it is...
	if (visions.allVisionsArray.length > visions.maxArraySize) {
		console.log("Too large - send it to the DB!");
		// Format allVisionsArray content, push to Mongo
		var mongoVisionsUpdate = [];
		for (var i = 0; i < visions.allVisionsArray.length; i++) {
			mongoVisionsUpdate[i] = {};
			mongoVisionsUpdate[i].tweet = visions.allVisionsArray[i];
		};

		twitterStorageDBC.insert(mongoVisionsUpdate, function() {
			// Clear this array, for new visions to populate
			visions.tempVisionsArray = [];
			phraseCheckReset(visions, cb);
		});

	// If it's not too large, continue and check phrase array	
	} else {
		phraseCheckReset(visions, cb);
	} 
}


phraseCheckReset = function(visions, cb) {
	console.log('--------------------------- Phrase Check/Reset ---------------------------');	
	// Do we have more phrases to search through? If so...
	if (visions.searchPhrasesArray.length > 0) {
		console.log("Go get some more");
		getTweets(visions, cb);

	// We're done! Push what remains...
	} else {
		console.log("All done. Pushing what remains...");
		// Format allVisionsArray content, push to MongoDB
		var mongoVisionsUpdate = [];
		for (var i = 0; i < visions.allVisionsArray.length; i++) {
			mongoVisionsUpdate[i] = {};
			mongoVisionsUpdate[i].tweet = visions.allVisionsArray[i];
		};

		// Upload remaining to MongoDB
		twitterStorageDBC.insert(mongoVisionsUpdate, function() {
			cb(null, visions);
		});
	}
}


getAllFinalTweets = function(visions, cb) {
	console.log('--------------------------- Get All Final Tweets ---------------------------');	

	var visionsPrepJSON = {};

	// Mongo: Query data from searchStrings collection
	twitterStorageDBC.find({}, function(err, docs) {
			if (!err) {
				console.log("Mongo: All twitterStorageDBC docs retrieved! Total: " + docs.length);
				visionsPrepJSON = docs;

				cb(null, visions, visionsPrepJSON);
			} else {
				console.log("Error retrieving data from twitterStorage Collection");
			}
		}
	);
}


finalPassClean = function(visions, visionsPrepJSON, cb) {
	console.log('--------------------------- FinalPass Clean ---------------------------');
	
	console.log("BEFORE visionsPrepJSON.length: " + visionsPrepJSON.length);

	// Levenshtein it up!

	// for (var i = (visionsPrepJSON.length - 1); i > 0; i--) {
	// 	for (var j = (visionsPrepJSON.length - 2); j > 0; j--) {
	// 		var applicant = visionsPrepJSON[i].tweet,
	// 			existing = visionsPrepJSON[j].tweet;

	// 			console.log("Applicant: " + applicant);
	// 			console.log("Existing: " + existing);

	// 		var distance = levenshtein.get(applicant.toLowerCase(), existing.toLowerCase());

	// 		if (distance < visions.levenshteinThreshold) {
	// 			console.log('found one');
	// 			// console.log("Applicant: " + applicant);
	// 			// console.log("Existing: " + existing);
				
	// 			visionsPrepJSON.splice(i, 1);
				
	// 			break; 
	// 		}
	// 	}
	// 	console.log(i);
	// }

	console.log("AFTER visionsPrepJSON.length: " + visionsPrepJSON.length);

	cb(null, visionsPrepJSON);
}


finalUploadRename = function(visionsPrepJSON, cb) {
	console.log('--------------------------- Final upload and rename ---------------------------');

	// Remove all documents from twitterStorageDBC
	twitterStorageDBC.remove({}, function() {

		// Upload remaining to MongoDB
		twitterStorageDBC.insert(visionsPrepJSON, function() {
			twitterStorageDBC.renameCollection("twitterVisions", true, function() {
				cb(null, visions);			
			})
		});
	});
}



endOfLine = function(visions, cb) {
	console.log('--------------------------- End of line ---------------------------');
	db.close();
}



// At Start: empty out Visions Storage Collection

// Store everything in a Visions Storage Collection

// Pull down VS Collection
// Apply Levenshtein filter

// Upload remaining list to Twitter Visions





















// ===========================
// Mongo Testing
// ===========================
mongoTest = function() {
var db = mongojs(mongoURI),
	searchStringsDBC = db.collection('searchStrings'),
	twitterStorageDBC = db.collection('twitterVisions');

	var tarray = ["I am here.", "I am there.", "I am everywhere"];
	var mongoVisionsUpdate = [];

	console.log(tarray.length);

	for (var i = 0; i < tarray.length; i++) {
		mongoVisionsUpdate[i] = {};
		mongoVisionsUpdate[i].tweet = tarray[i];
	};	

	twitterStorageDBC.insert(mongoVisionsUpdate, function() {
		console.log('Finished!');
		db.close();
	});

	console.log(mongoVisionsUpdate);
}







// ===========================
// Execute
// ===========================
searchBegin = function() {
	console.log('--------------------------- Starting ---------------------------');

    async.waterfall([
    	augurInit,
		retrieveSearchPhrases,
		processSearchStrings,
		updateDBIDs,
		getTweets,
		// scrubResults,
		getAllFinalTweets,
		finalPassClean,
		endOfLine
    ],
    function(err, botData) {
		if (err) {
			console.log('Run Error: ', err);
		}
    });
}


searchBegin();


// mongoTest();
























