const FuzzySearch = require('fuzzy-search'); // For parsing data
const cheerio = require('cheerio'); // For scraping data
const fetch = require('node-fetch'); // For promiseing resources

// Return a complete list of map titles from the liquipedia API.
function QueryMapList() {
  return fetch('https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max', {
    method: 'POST',
    gzip: true,
    headers: {
      'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)',
    },
  }).then(res => res.json())
    .then(body => body.query.categorymembers
      .filter(page => (page.ns === 0))
      .map(page => page.title));
}

// Fuzzy search a list of map titles. resolve if one matches, reject if none match.
function FuzzySearchMapTitle(searchTerm, mapList) {
  return new Promise((resolve, reject) => {
    const searcher = new FuzzySearch(mapList, [], { sort: true });
    const searchResults = searcher.search(searchTerm);

    // Check for 0 matching map results, reject or resolve.
    if (searchResults.length < 1) {
      reject(new Error(`The search term "${searchTerm}" yielded no results.`));
    }
    resolve(searchResults[0]);
  });
}

// Given a map title, return a uri for the related liquipedia article.
function GetMapArticleUri(mapTitle) {
  return `https://liquipedia.net/starcraft2/${mapTitle.replace(' ', '_')}`;
}

// Given a liquipedia article (of a map), scrape the map image.
function ScrapeFirstImgFromPage(pageUri) {
  return fetch(pageUri, {
    gzip: true,
    headers: {
      'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)',
    },
  }).then(res => res.text())
    .then((responseHtml) => {
      // Use cheerio to scrape the img url of the first image contained in a link.
      const $ = cheerio.load(responseHtml);
      return `https://liquipedia.net${$('a > img')[0].attribs.src}`;
    });
}

// Export a function, QueryMap,
//  returns the closest matching map title and image url.
module.exports = {
  QueryMap: async (searchTerm) => {
    const mapList = await QueryMapList();
    const mapTitle = await FuzzySearchMapTitle(searchTerm, mapList);
    const mapArticleUri = GetMapArticleUri(mapTitle);
    const mapImgUri = await ScrapeFirstImgFromPage(mapArticleUri);
    return {
      title: mapTitle,
      uri: mapImgUri,
    };
  },
};
