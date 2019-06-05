
const usageStrings = {
  map: `Command */map* _<map name>_ , where _map name_ is the name of an sc2 map. 
    I will reply with the closest matching map title and image. \n\n
    For example, \`\`\`/map habit station\`\`\` will pull up the map *Habitation Station*.\n`,
};

function HandleHelpMsg(req, res, next) {
  // Handle help msg
  if (req.body.text === '' || req.body.text === 'help') {
    res.status(200).send(usageStrings[req.params.cmd]);
    return;
  }
  next();
}

module.exports = {
  HandleHelpMsg
};
