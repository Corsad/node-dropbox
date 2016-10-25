#!/usr/bin/env babel-node

require('./helper')

const path = require('path')
const fs = require('fs')
let morgan = require('morgan')
let express = require('express')
let bodyParser = require('body-parser')
let Promise = require('songbird')
let nodeify = require('bluebird-nodeify')
let mime = require('mime-types')
let rimraf = require('rimraf')
let mkdirp = require('mkdirp')
let archiver = require('archiver')
let argv = require('yargs').argv
var net = require('net'),
    JsonSocket = require('json-socket');

let NODE_ENV = process.env.NODE_ENV
let PORT = process.env.PORT || 8000
let ROOT_DIR = argv.dir || process.cwd() 
var clientsocket

function setFileMeta(req, res, next){

  req.filePath = path.resolve(path.join(ROOT_DIR, req.url))  

  if(req.filePath.indexOf(ROOT_DIR) !== 0){
    res.status(400).send('Invalid Path') 
    return
  }

  fs.promise.stat(req.filePath)
    .then(stat => req.stat = stat, ()=> req.stat = null)
    .nodeify(next)
}

function setDirDetail(req, res, next){
    let endWithSlash = req.filePath.charAt(req.filePath.length-1) === path.sep
    let hasExt = path.extname(req.filePath) !== ''  
    req.isDir = endWithSlash || !hasExt
    req.dirPath = req.isDir ? req.filePath : path.dirname(req.filePath)
    next()
}

function sendHeader(req, res, next){
    nodeify((async ()=> {
      if (req.stat.isDirectory()) {
        let fileNames = await fs.promise.readdir(req.filePath)
        res.body = JSON.stringify(fileNames)
        res.setHeader('Content-Length', res.body.length)
        res.setHeader('Content-Type', 'aplication/json')
        return
      } 

      res.setHeader('Content-Length', req.stat.size)
      let contentType = mime.contentType(path.extname(req.filePath))
      res.setHeader('Content-Type', contentType)
    })().then(next))
}

function readHandler(req, res, next) {
  (async ()=>{
    if(res.body){
      if(req.get('Accept') == 'application/x-gtar') {
        let archive = archiver('zip')
        archive.pipe(res);
        archive.bulk([
          { expand: true, cwd: 'source', src: ['**'], dest: 'source'}
        ])
        archive.finalize()
        }  
      else {
        res.json(res.body)    
      }
      return
    }
    fs.createReadStream(req.filePath).pipe(res)

  })().catch(then)
}

function createHandler(req, res, next) {
  (async ()=>{
    if(req.stat)
    {
      return res.status(405).send("File Exists")
    }

    await mkdirp.promise(req.dirPath)
    
    if(!req.isDir){
        await fs.writeFile(req.filePath, req.body)
    }
    
    if(clientsocket){
      clientsocket.sendMessage({command: 'PUT', url: req.url, dirPath: req.dirPath, isDir: req.isDir, body: req.body})    
    }

    res.end()
  })().catch(next)
}

async function updateHandler(req, res, next) {
  (async ()=>{
    if(!req.stat){
      return res.status(405).send("File does not exists")
    }

    if(req.isDir){ 
        return res.status(405).send("Path is a Directory")
    }

    await fs.promise.truncate(req.filePath, 0)
    await fs.writeFile(req.filePath, req.body)
    
    if(clientsocket){
      clientsocket.sendMessage({command: 'POST', url: req.url, body: content})
    }

    res.end()
  })().catch(next)
}

function deleteHandler(req, res, next) {
    (async ()=>{
      if(!req.stat){
        return res.status(400).send("Invalid Path")
      }
      
      if(req.stat && req.stat.isDirectory){
        await rimraf.promise(req.filePath)
      } else {
        await fs.promise.unlink(req.filePath)
      }

      if(clientsocket){
        clientsocket.sendMessage({command: 'DELETE', url: req.url, stat: req.stat})
      }

      res.end()
    })().catch(next)
}

async function main() {
    console.log('main()...')

    let app = express()

    if(NODE_ENV == 'development'){
      app.use(morgan('dev'))
    }

    app.get('*', setFileMeta, sendHeader ,readHandler)

    app.head('*', setFileMeta, sendHeader, (req, res) => {
      res.end()
    })

    app.put('*', setFileMeta, setDirDetail, bodyParser.raw({
        type:'*/*'
    }), createHandler)
    
    app.post('*', setFileMeta, setDirDetail, bodyParser.raw({
        type:'*/*'
    }), updateHandler)

    app.delete('*', setFileMeta, deleteHandler)
    
    app.use((err, req, res, next) => {
        res.status(500).end('something wrong')
    })

    app.listen(PORT, () => {
        console.log(`LISTENING @ http://127.0.0.1:${PORT}`)
    })
    
    // json-socket
    
    var port = 8001;
    var server = net.createServer();
    server.listen(port);
    server.on('connection', function(socket) {
        clientsocket = new JsonSocket(socket);
        clientsocket.on('message', function(message) {
            if (message.command == 'start') {
              clientsocket.sendMessage({command: 'GET'})
            } else if (message.command == 'stop') {
              clientsocket.sendMessage({command: 'POST'})
            }
        });
    });    
}


main()