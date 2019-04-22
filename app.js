var rp = require('request-promise');
var fuzzysearch = require('fuzzy-search');
var cheerio = require('cheerio');
var express = require('express');

var app = express();
app.use(express.urlencoded({extended: false}));

app.post('/map', 
	
	function (req, res, next) {
		// Respond imediately to the POST request, then continue
		res.status(200).type('json').json({ response_type: "in_channel" });
		console.log('POST request to \'' + req.body.command + '\', with data: \'' + req.body.text + '\'');
		next();
	}, 
	
	function (req, res) {
		// Query a list of pages from the Liquipedia API.
		// 	Start with all the pages with "Category:Maps", then parse and filter,
		//	 Reutrn a list of objects, [{ pageid, title }...]
		rp({
			method: 'GET',
			uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max',
			gzip: true,
			headers: {
				'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
			},
			
			// parse, filter, and map the data into an array of page objects
			transform: function (body, response, resolveWithFullResponse) {
				return JSON.parse(body).query.categorymembers
							.filter(function(page) { return page.ns == '0'; })
							.map(page => ({ pageid: page.pageid, title: page.title}));
			}
		})

		// Fuzzy-search the list of page objects for the most relevant map title.
		//	Request the respective page from liquipedia and scrape for the img.
		//	 Send a POST to slack to show the map image and title.
		.then(function (page_list) {

			// Fuzzy-search the a filtered list of maps for the data argument
			var searcher = new fuzzysearch(page_list, ['title'], { sort: true });
			var possible_maps = searcher.search(req.body.text);

			// Return no matching map name.
			if(possible_maps.length < 1) {
				rp({
					method: 'POST',
					uri: req.body.response_url,
					body: {
						'response_type': "in_channel",
		    			'text': 'The search term \"' + req.body.text + '\" yielded no results.'
		    		},
					json: true
				});
				return;
			}

			// Generate the related pages' uri 
			var map_title = possible_maps[0].title;
			var generated_uri = 'https://liquipedia.net/starcraft2/' + map_title.replace(' ','_');

			// Request the html for the maps' liquipedia page.
			rp({
				method: 'GET',
				uri: generated_uri,
				gzip: true,
				headers: {
					'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
				}
			})
			.then(function (response_html) {
				// Use cheerio to scrape the url of the first image off the page.
				const $ = cheerio.load(response_html);
				const img_url = 'https://liquipedia.net' + $('a > img')[0].attribs['src'];

				// Report to server console
				console.log('Serving :  ' + img_url);

				// Send a response to sack's response_url.
				//	Format the message to show the map image and title.
				rp({
					method: 'POST',
					uri: req.body.response_url,
					json: true,
					body: {
						'response_type': "in_channel",
		    			"attachments":
							[{
								"title": map_title,
								"fallback": "image of map " + map_title,
								"image_url": img_url
							}]
		    		}
				});
			})
		})
		
		// Handle any errors
		.catch(function (err) {
			console.error(err);
		});
});

app.listen(8000, function(){
	console.log('starting server -- listening on port 8000.');
});