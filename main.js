const express = require('express')
const socket = require('socket.io')
const http = require('http')
const fs = require('fs')
const app = express()
const server = http.createServer(app)
const io = socket(server)
const os = require('os')
const request = require('request-promise-native')
const iconv = require('iconv-lite')
const util = require('util')
require('date-utils')

const android_id = 'Bot'
const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
const newlineHTMLReg = /&lt;br \/&gt;\n/g

var g_last_query = ''
var g_port = 1234

/* 서버를 1234 포트로 listen */
server.listen(g_port, function() {
	console.log('\x1b[42m======================== 1234 추적 서버 실행 중.. ============================\x1b[0m')
})

app.get('/', async function(request, response, next) {
	if(!request.headers.host) // 봇 쳐내
		return

	try
	{
		var data = await read_file_async('main.html')
		var text = data.toString()
					.replace(/\$_localhost/g, 'http://' + request.headers.host.substr(0, request.headers.host.length-5))
					.replace(/\$_port/g, g_port)

        if(/\/[^\/]*?\$_version/.test(text))
        {
            for(var e of text.match(/\/[^\/]*?\$_version/g))
            {
                var matchs = e.match(/\/(.*?)(\?.*)\$_version/)
                var file_name = matchs[1]
                var other_str = matchs[2]
                var stat = await stat_file_async(format('./static/{0}', file_name))
                stat = stat.toJSON().replace(/\D/g, '')
                text = text.replace(e, format('/{0}{1}{2}', file_name, other_str, stat))
            }
        }

		response.writeHead(200, {'Content-Type':'text/html'})
		response.write(text)
		response.end()
	}
	catch (exception)
	{
		log_exception('app.get', exception)
		response.send('서버가 고장남!!! Kakao ID: AnsanSuperstar 로 문의하세요' + '<p><p>에러 내용 : <p>' + format('<p>Name : {0}<p>ERROR : {1}<p>Message : {2}<p>Stack : {3}', exception.name, exception.err, exception.message, exception.stack))
	}
})

io.sockets.on('connection', function(socket) 
{
    socket.on('msg', function(msg) {
        socket.emit('msg', msg)
    })

    socket.on('nick', async function(nick) {
        console.log('nick:', nick)

        var ret = []

        var search_result = await GetArticleListByNick(nick)
        console.log(search_result)
        if(search_result.num_results == '0')
        {
            socket.emit('nick_result', null)
            return
        }

        for(var e of search_result.results)
        {
            var seq = e.post_seq
            console.log(seq)
            var search_result2 = await GetArticle(seq)
            console.log(search_result2)
            var android_id = search_result2.results[0].android_id

            ret.push({ title: e.post_title, nickname: e.nickname, android_id: android_id, reply_cnt: e.reply_cnt })
        }

        socket.emit('nick_result', ret)
    })

    const dateReg = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2}) (?<hh>\d{2}):(?<mm>\d{2}):(?<ss>\d{2})/
    socket.on('calc', async function(android_id) {
        var cnt = 50
        var search_index = 0

        var ret = []

        while(true)
        {
            console.log('finding', android_id, search_index, 'page')
            var search_result = await GetArticleListByAccount(android_id, search_index * cnt, cnt)
            console.log(search_result.num_results)
            if(search_result.num_results == '0')
                break

            for(var e of search_result.results)
            {
                // post_date: '2021-07-23 11:39:15'
                var reg_result = dateReg.exec(e.post_date).groups
                ret.push(reg_result)
            }

            if(search_result.num_results != cnt)
                break

            if(search_index >= 300)
                break

            ++search_index
        }
        console.log('finish')

        socket.emit('calc_result', ret)
    })
    


})







function stat_file_async(file_name)
{
	return new Promise(function (resolve, reject) {
		fs.stat(file_name, function(err, data) {
			err ? reject(err) : resolve(data.mtime)
		})
	})
}

function read_file_async(file_name)
{
	return new Promise(function (resolve, reject) {
		fs.readFile(file_name, 'utf8', function(err, data) {
			err ? reject(err) : resolve(data)
		})
	})
}

function log(type, function_name, message, isChat = false)
{
	var color = '\x1b[37m'
	if(type == 'INFO')
		color = '\x1b[32m'
	else if(type == 'ERROR' || type == 'ERROR_CATCH')
		color = '\x1b[31m'

	return console.log(format('\x1b[47m\x1b[30m({0})\x1b[0m\x1b[40m [{2}]{1}', GetDate(), color, function_name), message, '\x1b[0m')
}

function log_exception(function_name, exception, message = null)
{
	if(typeof(message) == 'object')
		message = JSON.stringify(message)
	log('ERROR_CATCH', function_name, format('\nName : {0}\nERROR : {1}\nMessage : {2}\nStack : {3}\nComment : {4}\nLast Query : {5}', exception.name, exception.err, exception.message, exception.stack, message, g_last_query))
	io.sockets.emit('throw_data', exception)
}

function format() 
{ 
	var args = Array.prototype.slice.call (arguments, 1); 
	return arguments[0].replace (/\{(\d+)\}/g, function (match, index) { return args[index]; }); 
}

function GetTime() 
{
	return new Date().addHours(9).toFormat('HH24:MI')
}
function GetDate() 
{
	return new Date().addHours(9).toFormat('YYYY-MM-DD HH24:MI:SS')
}

async function GetArticle(no)
{
	return await _GET('http://lolwiki.kr/freeboard/get_post_detail.php', { boardid: 'freeboard', post_seq: no} )
		.then(res => res.trim())
		.then(res => res.replace(newlineHTMLReg, '\\r\\n'))
		.then(res => res.replace(/\n/g, '\\r\\n'))
		.then(res => res.replace(/'/g, '"'))
		.then(res => res.replace(/&lt;/g, '<'))
		.then(res => res.replace(/&gt;/g, '>'))
		.then(JSON.parse)
}

async function GetArticleListByNick(nick, cnt = 1)
{
	return await _POST('http://lolwiki.kr/freeboard/get_post.php', 
		{ boardid: 'freeboard', android_id: android_id, seq: 0, search: '', cnt: cnt, isvote: false, iszzal: false, ismine: false, nickSearch: nick } )
		.then(res => res.replace(/\n/g, '\\r\\n'))
		.then(JSON.parse)
}

async function GetArticleListByAccount(android_id, seq = 0, cnt = 50)
{
	return await _POST('http://lolwiki.kr/freeboard/get_post.php', 
		{ boardid: 'freeboard', android_id: android_id, seq: seq, search: '', cnt: cnt, isvote: false, iszzal: false, ismine: true, nickSearch: '' } )
		.then(res => res.replace(/\n/g, '\\r\\n'))
		.then(JSON.parse)
}

async function GetArticleList(seq = 0, cnt = 1)
{
	return await _POST('http://lolwiki.kr/freeboard/get_post.php', 
		{ boardid: 'freeboard', android_id: android_id, seq: seq, search: '', cnt: cnt, isvote: false, iszzal: false, ismine: false, nickSearch: '' } )
		.then(res => res.replace(/\n/g, '\\r\\n'))
		.then(JSON.parse)
}

async function _GET(url, body = {}) {
	return new Promise( function(resolve, reject) { 
		request( { url: url, headers: headers, method: 'GET', qs: body, encoding: null }, function(err, res, html) {
			err ? reject(err) : resolve(iconv.decode(html, 'euc-kr'))
		})
	})
}

async function _POST(url, body = {}) {
	return new Promise( function(resolve, reject) { 
		request( { url: url, headers: headers, method: 'POST', form: body, encoding: null }, function(err, res, html) {
			err ? reject(err) : resolve(iconv.decode(html, 'euc-kr'))
		})
	})
}

