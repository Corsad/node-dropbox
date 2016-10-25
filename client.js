#!/usr/bin/env babel-node

require('./helper')

let path = require('path')
var net = require('net'),
    JsonSocket = require('json-socket');
let argv = require('yargs').argv
const fs = require('fs')
let rimraf = require('rimraf')
let mkdirp = require('mkdirp')

let CLIENT_DIR = argv.dir || path.resolve(path.join(process.cwd(), "client")) 

var isDir
var filePath

var port = 8001; //The same port that the server is listening on 
var host = '127.0.0.1';
var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket 
socket.connect(port, host);
socket.on('connect', function() { //Don't send until we're connected 
    socket.sendMessage({command: 'start', beginAt: 10});
    socket.on('message', async function(message) {
        if(message.command == "PUT"){
            isDir = message.isDir
            filePath = getPath(message.url)

            await clientPUT(getDir(isDir), message.body)
        } else if(message.command == "POST"){
            filePath = getPath(message.url)

            await clientPost(message.body)
        } else if(message.command == "DELETE"){
            filePath = getPath(message.url)

            await clientPost(message.stat)
        }
    });
});

function getDir(isDir){
    return isDir ? filePath : path.dirname(filePath)
}

function getPath(url){
      return path.resolve(path.join(CLIENT_DIR, url))  
}

async function clientPUT(dirPath, body){
    await mkdirp.promise(dirPath)
    
    if(!isDir){
        await fs.writeFile(filePath, body)
    }
}

async function clientPOST(body){
    await fs.promise.truncate(filePath, 0)
    await fs.writeFile(filePath, body)
}

async function clientDELETE(stat){
    if(stat && stat.isDirectory){
        await rimraf.promise(filePath)
    } else {
        await fs.promise.unlink(filePath)
    }
}