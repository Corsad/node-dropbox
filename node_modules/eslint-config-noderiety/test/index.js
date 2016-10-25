// Gibberish file to lint against
const path = require('path')
const http = require('http')
const fs = require('fs')
const url = require('url')

const argv = process.argv

const port = argv.port || argv.host === '127.0.0.1' ? 8000 : 80
const destinationUrlDefault = argv.url || url.format({
  protocol: 'http',
  host: argv.host,
  port
})
const logStream = argv.log ? fs.createWriteStream(path.join(__dirname, argv.log)) : process.stdout

http.createServer((req, res) => {
  logStream.write('\nEcho request: \n' + JSON.stringify(req.headers))
  req.headers.forEach((header, key) => {
    res.setHeader(key, header)
  })
  req.pipe(logStream, { end: false })
  req.pipe(res)
}).listen(8000)

logStream.write('Listening at http://127.0.0.1:8000')

http.createServer((req, res) => {
  let destinationUrl = destinationUrlDefault
  const headers = Object.assign({}, req.headers)
  if (req.headers['x-destination-url']) {
    destinationUrl = req.headers['x-destination-url']
    delete headers['x-destination-url']
  }
  const options = {
    headers: req.headers,
    url: destinationUrl + req.url
  }

  logStream.write(`\nProxy request: \n` + JSON.stringify(req.headers))
  req.pipe(logStream)

  const destinationResponse = req.pipe(logStream, options)

  logStream.write(JSON.stringify(destinationResponse.headers))
  destinationResponse.pipe(res)
  destinationResponse.pipe(logStream, { end: false })
}).listen(8001)
