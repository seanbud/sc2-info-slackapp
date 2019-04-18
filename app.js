var express = require('express');
var app = express();

app.use(express.json());       // to support JSON-encoded bodies

var request = require('request');
var fuzzysearch = require('fuzzy-search');
var fs = require('fs');

app.post('/map', function (req, res) {
	// Get the data argument sent in the post. 
	var data_arg = req.body.text;
	console.log('POST request to map, with data: ' + data_arg + '\n');

	// Make a request to liquipedia, return a list of maps, and their pageids.
	var maps_list = request_maps_from_liquipedia();

	// TODO! Fuzzy-search the a filtered list of maps for the data argument
	// var searcher = new fuzzysearch(maps_list, ['title'], { sort: true });
	// var result = searcher.search("data_arg");

	// console.log("map list :  " + maps_list + "\n\n\n");
	// console.log("result of fuzzy-search : " + result);

	// TODO Make another request to liquipedia; search that pageid for it's 1st imageinfo, and parse for the url.
	
	// TODO Reply to the client with the url.
	// res.status(200).send('POST response with map name: ' + result + '\n');
	res.status(200).send('returned maplist: ' + maps_list);
});

app.listen(8000, function(){
	console.log('restarting server -- listening on port 8000.');
});

function request_maps_from_liquipedia() {

	const options = {
		method: 'GET'
		, uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max'
		, gzip: true
	};

	// Parse response as json, then filter and map the data to look like { pageid, title }
	function callback(error, response, body) {
		try {
			const data = JSON.parse(body);
			var maps_list = data.query.categorymembers
				.filter(function(page) { return page.ns == "0"; })
				.map(page => ({ pageid: page.pageid, title: page.title}));

			console.log(maps_list);

			// // Store the results in a variable belonging to an outside scope.
			// maps_pagelist = maps_list; //maps_list.map(a => (Object.assign({}, a)));
			
		} 
		catch(err) {
		  console.error(err);
		}
	}

	// make the request
	request(options, callback);

	// return the list of maps
	return true;
}


function request_image_url(pageid) {
	var image_url;		// return this list
	
	const options = {
		method: 'GET'
		, uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max'
		, gzip: true
	};

	// Parse response as json, then filter and map the data to look like { pageid, title }
	function callback(error, response, body) {
		try {
			const data = JSON.parse(body);
			image_url = 'todo - parse for the url. see example below';
			// var maps_list = data.query.categorymembers
			// 	.filter(function(map_article) { return map_article.ns == "0"; }) 
			// 	.map(map_article => ({ pageid: map_article.pageid, title: map_article.title}));
			// console.log(maps_list);
			// image_url = maps_list;
		} 
		catch(err) {
		  console.error(err)
		}
	}

	// make the request
	request(options, callback);

	// return the list of 
	return image_url;
}



// TODO how to save to a file.
	// request('https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max')
	// 	.pipe(fs.createWriteStream('doodle.json'));


// function foo() {
// 	console.log('hello!');
// 	request('https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max', function (error, response, body) {
// 		var maps;
// 		console.log('responsecode: ' + response.statusCode);
// 		if (!error && response.statusCode == 200) {
// 			// TODO parse and store the list of maps into a variable and serialize it.
			
// 			maps = body; 
// 			console.log(maps);
// 		} else {
// 			console.log('err: ' + error);
// 		}
// 	})
// }