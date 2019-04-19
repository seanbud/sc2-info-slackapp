var express = require('express');
var app = express();

app.use(express.json());       // to support JSON-encoded bodies

var request = require('request');
var fuzzysearch = require('fuzzy-search');
var rp = require('request-promise');


// skeep- util function
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

app.post('/map', function (req, res) {
	// Get the data argument sent in the post. 
	var data_arg = req.body.text;
	console.log('POST request to map, with data: \"' + data_arg + '\"\n');

	// Make a request to liquipedia, return an array of page objs, ie.  [{ pageid, title }...]
	var options = {
			method: 'GET'
			, uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max'
			, gzip: true,
			headers: {
	    		'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
	  		},
	  		// parse, filter, and map the data into an array of page objects
			transform: function (body, response, resolveWithFullResponse) {
				return JSON.parse(body).query.categorymembers
							.filter(function(page) { return page.ns == '0'; })
							.map(page => ({ pageid: page.pageid, title: page.title}));
			}
	};

	// Execute the request, and return a promise
	rp(options)
	    .then(function (page_list) {
	    	// in this promise,
	    	// print the number of pages found..
			console.log(page_list.length + ' pages found..');
			// console.log('dataarg : ' + data_arg);
			// console.log(page_list);

			// Fuzzy-search the a filtered list of maps for the data argument
			var searcher = new fuzzysearch(page_list, ['title'], { sort: true });
			var possible_maps = searcher.search(data_arg);

			// Handle no matching map name.
			if(possible_maps.length < 1) {
				res.status(200).send('The search term \"' + data_arg + '\" yielded no results.');
				return;
			}

			// report results of fuzzy search.
			console.log('result of fuzzy-search : ' + JSON.stringify(possible_maps));

			var page_ext = possible_maps[0].title.replace(' ','_');

			// Generate a new uri using the pageid
			var generated_uri = 'https://liquipedia.net/starcraft2/' + page_ext;

			res.status(200).send(generated_uri);
		})
		.catch(function (err) {
	        // TODO handle errs
	        console.error(err);
	    });
});

app.listen(8000, function(){
	console.log('restarting server -- listening on port 8000.');
});

