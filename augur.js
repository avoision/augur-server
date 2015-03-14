var _             = require('lodash');
var Client        = require('node-rest-client').Client;
var Twit          = require('twit');
var async         = require('async');
var wordfilter    = require('wordfilter');
var request       = require('request');

var t = new Twit({
    consumer_key:         	process.env.AUGURAPP_TWIT_CONSUMER_KEY,
    consumer_secret:      	process.env.AUGURAPP_TWIT_CONSUMER_SECRET,
    access_token:         	process.env.AUGURAPP_TWIT_ACCESS_TOKEN,
    access_token_secret:  	process.env.AUGURAPP_TWIT_ACCESS_TOKEN_SECRET
});



getPublicTweet = function(cb) {
    t.get('search/tweets', {q: '\"i%20just%20want\"', count: 100, result_type: 'recent', lang: 'en'}, function(err, data, response) {
		if (!err) {
			var pattern = /^i\ just\ want/;
			var botData = {
				allPosts: [],
				allParsedTweets: []
			};
			
			// Loop through all returned statues
			for (var i = 0; i < data.statuses.length; i++) {

				var tweet = data.statuses[i].text.toLowerCase(),
					hasReply = tweet.indexOf('@'), 
					hasHashtag = tweet.indexOf('#')
					hasLink = tweet.indexOf('http');
					hasAmp = tweet.indexOf('&');


				// Does the tweet contain offensive words?
				if (!wordfilter.blacklisted(tweet)) {
					// Does the tweet begin with "I just want?"
					if (pattern.test(tweet)) {
						// Does the tweet have a reply, hashtag, or URL?
						if ((hasReply == -1) && (hasHashtag == -1) && (hasLink == -1) && (hasAmp == -1)) {
							botData.allPosts.push(data.statuses[i].text);
						}
					}
				}
			}

			if (botData.allPosts.length > 0 ) {
				// Remove duplicates
				botData.allPosts = _.uniq(botData.allPosts);
       			cb(null, botData);
			} else {
				cb("No tweets beginning with \'I just want...\'");
			}
		} else {
			cb("There was an error getting a public Tweet. Abandoning EVERYTHING :(");
		}
    });
};



// ===========================
// Execute
// ===========================
run = function() {
	console.log("========= Starting! =========");

    async.waterfall([
		// getPublicTweet, 
		// extractWordsFromTweet,
		// getAllWordData, 
		// findNouns,
		// getAllFlickrIDs,
		// flickrIDClean,
		// getAllFlickrSizes,
		// formatTweet
    ],
    function(err, botData) {
		if (err) {
			console.log('There was an error posting to Twitter: ', err);
		}
    });
}

// ===========================
// Cleanup
// ===========================

// console.log('hello world');






