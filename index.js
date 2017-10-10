/* jshint asi: true, node: true, esversion: 6, undef: true, unused: true */

/*
    Crypto-socket

    A basic wrapper for websockets, along with pusher and autobahn for the exchanges that use them.
    Most exchanges (that use normal websockets) are passed through 'makeSocket'. Which updates 
    global variable 'Exchanges' which can be accssessd via .getQuote('btcusd','bitfinex').
    Values wont appear until the socket returns the something. Most of the exchanges send back
    a fair amount of data other than a simple last trade price but that is the only information
    currently stored.
*/

var WebSocket = require('faye-websocket'),
    Pusher = require('pusher-client'),
    autobahn = require('autobahn'),
    bittrex = require('node.bittrex.api')

var Exchanges = {},
    Sockets = {},

    BfxChannelIds = {}

exports.Exchanges = Exchanges
/* Eventually get this information from some kind of endpoint
    that can be requested on demand and potentially stored
    ... somewhere ?
    Also to note, theres no btcSym because (for now)
    can just convert it as normal. But some symbol names
    are different across exchanges (BCC/BCH)
    Once this is replicated across the other exchanges
    only this variable will need to be changed to support any market.
*/

var ExchangeInfo = {
    'bittrex': {
        'USD': [
            'BTC', 'ETH', 'NEO',
            'LTC', 'BCC', 'ETC',
            'ZEC', 'XMR', 'DASH',
            'XRP'
        ],
        'ETH': [
            'OMG', 'NEO', 'QTUM',
            'PAY', 'BCC', 'LTC',
            'SNT', 'XRP', 'CVC',
            'ADX', 'ETC', 'GNT',
            'STRAT', 'ZEC', 'BAT',
            'TKN', 'XMR', 'MTL',
            'FUN'
        ]
    },
    // bifinex calls BCC bcash?
    // not supporting chain split tokens
    // because they're BCC .... its confusing af
    'bitfinex': {
        'USD': [
            'BTC', 'LTC', 'ETH',
            'ETC', 'RTT', 'ZEC',
            'XMR', 'DASH', 'IOTA',
            'EOS', 'SAN', 'OMG',
            'BCC'
        ],
        'ETH': [
            'IOTA', 'EOS', 'SAN', 'OMG',
            'BCC'
        ]
    }
}

// helper function that can simply echo the exchanges variable so its kinda like a ticker.
exports.echoExchange = function() {
    console.log("\n\n\n\n\n\n\n\n\n\n")
    for (var k in Exchanges) {
        console.log('\t' + k)
        var r = ''
        for (var s in Exchanges[k]) {
            r += s + '\t' + Exchanges[k][s] + '\t'
        }
      console.log(r)
    }
    //console.log(Exchanges)
}

var status = function(exchange, event, status) {
  if (typeof status === 'undefined') status = {}
  else if  (typeof status === 'string') status = { diagnostic: status }

  console.log(exchange + ' ' + event + ': ' + JSON.stringify(status))
}
exports.status = status

var update = function(exchange, symbol, value) {
  if (typeof Exchanges[exchange] === 'undefined') Exchanges[exchange] = {}
  if (Exchanges[exchange][symbol] === value) return

  Exchanges[exchange][symbol] = value

//  console.log({ exchange: exchange, symbol: symbol, value: Exchanges[exchange][symbol] })
}
setInterval(() => { console.log(JSON.stringify(Exchanges, null, 2)) }, 30 * 1000)
exports.update = update

exports.debugP = false

exports.start = function(exchange, symbols) {
    if (typeof exchange == "undefined") {
        cryptoSockets.start()
    } else {
        // check if its supported... ?
        cryptoSockets.start(exchange, symbols)
    }
}


// bread and butter for 2/3 of exchanges. url is the websocket endpoint, title refers to the exchange (single word),onMessage
// is a function that runs when the socket receives a message, send is an object that is sent to subscribe where applicable
var supportedExchanges = [
    'bittrex',
    'bitfinex',
    'bitmex',
    'bitstamp',
    'cex',
    'gdax',
    'gemini',
    'okcoin',
    'poloniex'
]
var getExchangeSymbols = function(exchange) {
  return ExchangeInfo[exchange]
}
exports.getExchangeSymbols = getExchangeSymbols
var assembleSymbols = function(exchange) {
  var supportedSymbols = []
  var filter = function(main) {
      var symbol = ''
      var sub = ''
      if (exchange == 'bitfinex' && key == 'BCC') {
          sub = 'BCC'
      } else {
          sub = key
      }

      if (main != "BTC") {
          symbol = main + sub
      } else {
          symbol = sub + main
      }
      supportedSymbols.push(symbol)
  }
    for (var key in ExchangeInfo[exchange]) {
        ExchangeInfo[exchange][key].filter(filter)

    }
    return supportedSymbols
}
exports.supportedExchanges = supportedExchanges

var cryptoSockets = {
    'bittrex': function(symbols) {
        if (exports.debugP) console.log(symbols)
        if (typeof symbols == 'undefined') {
            // default it
            symbols = ['BTCUSD']
        }
        var activeBittrexSymbols = assembleSymbols('bittrex')

        function convertSymbol(sym) {
            // check for used
            var pairs = ['BTC', 'USD', 'ETH']
            var symbol = ''
            if (sym == 'BTCUSD') {
                return 'USDT-BTC'
            } else {
                pairs.filter(function(p) {
                    if (exports.debugP) console.log(p)
                    if (sym.endsWith(p) && symbol == '') {
                        symbol = p + (p == 'USD' ? 'T' : '') + '-' + sym.split(p)[0]
                    }
                })

            }
            if (typeof symbol != 'undefined' && symbol != '') {
                return symbol
            } else {
              status('bittrex', 'error', { symbol: sym, diagnostic: 'market not found' })
            }
        }
        if (typeof symbols != 'undefined') {
            // check exchanges to see that quote is not 
            // already reporting
            // this mostly handles appropriate referen
            symbols.filter(function(sym) {
                if (parseInt(activeBittrexSymbols.indexOf(sym)) > -1) {
                    //    console.log('already listening ' + sym)
                    activeBittrexSymbols.push(sym)
                }
                var relation = convertSymbol(sym)
                //console.log( 'listen for ' + relation)
                // not a web socket poll/diff :(
                bittrex.getticker({ market: relation, stream: true }, function(response) {
                    var responseObj = response.result
                    // cant believe this crap. the only way to avoid 'null' errors
                    // if market was invalid etc.
                    if (typeof responseObj != 'undefined' && responseObj != null && responseObj && typeof responseObj.Last == 'number') {
                        update('bittrex', parseFloat(responseObj.Last))
                    }
                    //}
                })
                //}
            })
            // unlisten to variables that aren't present?
            // to do add all open 'getTicker' sockets to another variable so they can be closed
            /*
            for(var key in Exchanges.bittrex){
                if(parseInt(listening.indexOf(key)) == -1){
                    // unlisten to this quote somehow
                }
            }*/
            return true
        }
    },
    'bitfinex': function(symbols) {
        // walk through exchange info to build list of supported symbols
      var activeSymbols = []
      var supportedSymbols = ['BTCUSD']
      var supported = function(main) {
          var symbol = ''
          var sub = ''
          if (key == 'BCC') {
              sub = 'BCC'
          } else {
              sub = key
          }
          if (main != "BTC") {
              symbol = main + sub
          } else {
              symbol = sub + main
          }
          supportedSymbols.push(symbol)
      }
        for (var key in ExchangeInfo.bitfinex) {
            ExchangeInfo.bitfinex[key].filter(supported)          
        }
        if (typeof symbols == 'undefined') {
            activeSymbols.push({
                "event": "subscribe",
                "channel": "ticker",
                "pair": 'BTCUSD'
            })
        } else {
            if (typeof symbols == 'string') {
                if (parseInt(supportedSymbols.indexOf(symbols)) > -1) {
                    activeSymbols.push({
                        "event": "subscribe",
                        "channel": "ticker",
                        "pair": symbols
                    })
                }
            } else if (symbols.length > 0) {
                symbols.filter(function(s) {
                    if (exports.debugP) console.log(s)
                    if (parseInt(supportedSymbols.indexOf(s)) > -1) {
                        activeSymbols.push({
                            "event": "subscribe",
                            "channel": "ticker",
                            "pair": s
                        })
                    }
                })
            }
        }
        // probably had to make this self because of the filter function
        var fmakeSocket = this.makeSocket
        activeSymbols.filter(function(sym){
        // should add symbol name to 'title' for 'close' reference
        // but causes issue with 'tickerCode on line 285'
        fmakeSocket('wss://api2.bitfinex.com:3000/ws', 'bitfinex', function(event) {
            if (typeof event.data != "undefined") {
                var data = JSON.parse(event.data)
                if (typeof data.event != "undefined" && data.event == "subscribed" || data.event == "info") {
                    if (data.event == "subscribed" && typeof data.chanId != "undefined" && typeof data.pair != "undefined") {
                        // match channel id with pair
                        BfxChannelIds[data.chanId + ''] = data.pair
                    }
                }
                if (typeof data[1] != "undefined" && data[1] != "hb") {
                    var floatCheck = parseFloat(data[7])
                    var tickerValue
                    if (floatCheck && floatCheck > 0) {
                        tickerValue = floatCheck
                    }
                    if (tickerValue) {
                        var tickerCode
                        if (tickerValue < 2) {
                            // this is ETH
                            tickerCode = 'ETHBTC'
                        } else {
                            tickerCode = "BTCUSD"
                        }
                        //force string
                        tickerCode = BfxChannelIds[data[0] + '']

                        if (tickerCode) {
                            update('bitfinex', tickerCode, tickerValue)
                        }
                    }
                }
            }
        }, sym)
        })
        return true
    },
    'bitmex': function(symbol) {
        // to support more bitmex symbols check out their rest API and implement symbols you see from
        // the return of their endpoints
        var symbols = {
            ".ETHXBT": "ETHBTC",
            "XBTUSD": 'BTCUSD',
            ".LTCXBT": "LTCBTC"
        }
        var query
        if ((typeof symbol === 'undefined') || (typeof symbol === 'string')) {
            query = Object.keys(symbols)
                .filter((key) => {
                    if (symbol) {
                        return symbols[key] == symbol
                    } else {
                        return true
                    }
                })
                .map((symbol) => { return 'trade:' + symbol })
                .join(',')
        } else {
            query = []
            symbol.forEach((sym) => {
                Object.keys(symbols).filter((key) => { return symbols[key] === sym }).map((key) => {
                  query.push( 'trade:' + key)
                })
            })
            query = query.join(',')
        }
        this.makeSocket('wss://www.bitmex.com/realtime?subscribe=' + query, 'bitmex', function(event) {
            if (typeof event.data != "undefined") {
                var data = JSON.parse(event.data)
                if (data && data.data) {
                    data = data.data[0]
                    if (typeof data == "undefined" || typeof data.symbol == "undefined") {
                        // some responses are blank or notification of sub.. when that happens this crashes... 
                        return false
                    }
                    if (symbols[data.symbol]) {
                        update('bitmex', symbols[data.symbol], parseFloat(data.price))
                    }
                } else {
                    if ((data.success === true) || (data.info)) return

                    // close the socket?
                    status('bitmex', 'error', "Issue with bitmex response: " + JSON.stringify(data))
                }
            }
        })
        return true
    },
    'bitstamp': function(symbols) {
        if (typeof Pusher != "undefined") {
            var pusher, matchP
            try {
                pusher = new Pusher('de504dc5763aeef9ff52', {})
            } catch (error) {
                status('bitstamp', 'error', error.toString())
                return false
            }
            if ((typeof symbols === 'undefined') || (symbols.length === 0)) {
              symbols = [ 'BTCUSD', 'ETHBTC' ]
            } else if (typeof symbols === 'string') {
              symbols = [ symbols ]
            }

            symbols.forEach((symbol) => {
                var suffix = symbol.toLowerCase()
                if ([ 'btceur',
                      'btcusd',
                      'ethbtc',
                      'etheur',
                      'ethusd',
                      'eurusd',
                      'ltcbtc',
                      'ltceur',
                      'ltcusd',
                      'xrpbtc',
                      'xrpeur',
                      'xrpusd',
                    ].indexOf(suffix) === -1) return
                matchP = true

                var BitstampSocket = pusher.subscribe('live_trades_' + suffix)
                try {
                  BitstampSocket.bind('trade', function(data) {
                      update('bitstamp', symbol, parseFloat(data.price))
                  })
                  status('bitstamp', 'open', { symbol: symbol })
                } catch (ex) {
                  status('bitstamp', 'error', { symbol: symbol, diagnostic: ex.toString() })
                }
            })
            return (matchP || false)
        } else {
            status('bitstamp', 'error', 'no pusher')
            return false
        }
    },
    'cex': function(symbols) {
        if ((typeof symbols === 'undefined') || (symbols.length === 0)) {
          symbols = [ 'BTCUSD', 'ETHBTC' ]
        } else if (typeof symbols === 'string') {
          symbols = [ symbols ]
        }
        this.makeSocket('wss://ws.cex.io/ws/', 'cex', function(event) {
            if (typeof event.data != "undefined") {
                var data = JSON.parse(event.data)
                var tickerCode = data.symbol1 + data.symbol2
              
                if (data && typeof data.data != "undefined") {
                    data = data.data
                    tickerCode = data.symbol1 + data.symbol2
                    if (symbols.indexOf(tickerCode) !== -1) {
                        update('cex', tickerCode, parseFloat(data.price))
                    }
                }
            }
        }, {
            "e": "subscribe",
            "rooms": [
                "tickers"
            ]
        })
        return true
    },
    'gdax': function(symbol) {
        var norm = (symbol) => { return symbol.replace('-', '') }
        var query
        if ((typeof symbol === 'undefined') || (typeof symbol === 'string')) {
            query = [{
                    "type": "subscribe",
                    "product_id": "BTC-USD"
                }, {
                    "type": "subscribe",
                    "product_id": "ETH-BTC"
                },
                {
                    "type": "subscribe",
                    "product_id": "LTC-BTC"
                }
            ].filter((item) => {
                return typeof symbol == 'undefined' || norm(item.product_id) == symbol
            })
        } else {
          query = []
          symbol.forEach((sym) => {
            query.push({ type: 'subscribe', product_id: sym.substr(0,3) + '-' + sym.substr(3) })
          })
        }
        this.makeSocket('wss://ws-feed.gdax.com/', 'gdax', function(event) {
            if (typeof event.data != "undefined") {
                var data = JSON.parse(event.data)
                if ((data) && (typeof data.type != "undefined") && (data.price)) {
                    update('gdax', norm(data.product_id), parseFloat(data.price))
                }
            }
        }, query)
    },
    'gemini': function(symbol) {
        if ((typeof symbol === 'object') && (symbol instanceof Array)) {
            symbol.forEach((sym) => {
                this.makeSocket('wss://api.gemini.com/v1/marketdata/' + sym.toLowerCase(), 'gemini', function(event) {
                    if (typeof event.data != "undefined") {
                        var data = JSON.parse(event.data)
                        if (data && typeof data.events != "undefined") {
                            data = data.events[0]
                            if (data.type == "trade") {
                                update('gemini', sym, parseFloat(data.price))
                            }
                        }
                    }
                })
            })
            return true
        }
        if (typeof symbol != "undefined" && symbol == 'ETHBTC') {
        } else {
            this.makeSocket('wss://api.gemini.com/v1/marketdata/btcusd', 'gemini', function(event) {
                if (typeof event.data != "undefined") {
                    var data = JSON.parse(event.data)
                    if (data && typeof data.events != "undefined") {
                        data = data.events[0]
                        if (data.type == "trade") {
                            update('gemini', 'BTCUSD', parseFloat(data.price))
                        }
                    }
                }
            })
        }
        if (typeof symbol != "undefined" && symbol == 'BTCUSD') {
        } else {
            this.makeSocket('wss://api.gemini.com/v1/marketdata/ethbtc', 'gemini2', function(event) {
                if (typeof event.data != "undefined") {
                    var data = JSON.parse(event.data)
                    if (data && typeof data.events != "undefined") {
                        data = data.events[0]
                        if (data.type == "trade") {
                            update('gemini', 'ETHBTC', parseFloat(data.price))
                        }
                    }
                }
            })
        }
        return true
    },
    'okcoin': function(symbol) {
        var query = [{
                "event": "addChannel",
                "channel": "ok_btcusd_ticker",
                "pair": "BTCUSD"
                //"prec" : "P0"
            }, {
                "event": "addChannel",
                "channel": "ok_ltcusd_ticker",
                "pair": "LTCUSD"
            },
            {
                "event": "addChannel",
                "channel": "ok_ethusd_ticker",
                "pair": "ETHUSD"
                //"prec" : "P0"
            }
        ]

        if (typeof symbol == "string" && symbol == "LTCUSD") {
            query.shift()
        } else if (typeof symbol == "string" && symbol == "BTCUSD") {
            query.pop()
        }
        this.makeSocket('wss://real.okcoin.com:10440/websocket/okcoinapi', 'okcoin', function(event) {
            var data = JSON.parse(event.data)
            if (data) {
                data = data[0]
            } else {
                status('okcoin', 'error',  "Issue with okcoin response: " + JSON.stringify(event))
                return false
            }
            if (typeof data.data == "undefined") {
                // nothing to process
                return false
            }
            if (typeof data != "undefined" && typeof data.channel != "undefined") {
                var tickerCode
                if (data.channel == "ok_ltcusd_ticker") {
                    tickerCode = "LTCUSD"
                } else if (data.channel == "ok_btcusd_ticker") {
                     tickerCode = "BTCUSD"
                }
                data = data.data.last
                var floatCheck = parseFloat(data)
                if (floatCheck && floatCheck > 0) {
                    update('okcoin', tickerCode, floatCheck)
                }
            }
        }, query)

        return true

    },
    'poloniex': function(symbol) {
        var wsuri = "wss://api.poloniex.com"
        Sockets.poloniex = new autobahn.Connection({
            url: wsuri,
            realm: "realm1"
        })
        try {
            Sockets.poloniex.onopen = function(session) { /* jshint unused: false */
                status('poloniex', 'open')
                session.subscribe('ticker', function(args, kwargs) {
                    var codeConversion = {
                        "BTC_ETH": "ETHBTC",
                        "USDT_BTC": "BTCUSD",
                        "USDT_LTC": "LTCUSD",
                        "USDT_XRP": "XRPUSD",
                        "USDT_DASH": "DASHUSD",
                        'USDT_XMR': "XMRUSD",
                        'USDT_ZEC': "ZECUSD",
                        "USDT_NXT": "NXTUSD",
                        "BTC_LTC": "LTCBTC",
                        "BTC_DASH": "DASHBTC",
                        "USDT_ETH": "ETHUSD",
                        "BTC_POT": "POTBTC",
                        "BTC_XMR": "XMRBTC",
                        "BTC_DOGE": "DOGEBTC",
                        "BTC_ZEC": "ZECBTC",
                        "BTC_XLM": "XLMBTC",
                        "BTC_ETC": "ETCBTC",
                        "BTC_MAID": "MAIDBTC",
                        "BTC_XEM": "XEMBTC",
                        "BTC_BTS": "BTSBTC",
                        "BTC_BCH": "BCHBTC",
                        "USDT_BCH": "BCHUSD",
                        "BTC_XRP": "XRPBTC"
                    }
                    var tickerCode = (typeof codeConversion[args[0]] != "undefined" ? codeConversion[args[0]] : false)
                    if (!tickerCode) return

                    if ((typeof symbol === 'object') && (symbol instanceof Array)) {
                      if (symbol.indexOf(tickerCode) === -1) return
                    } else if ((tickerCode != symbol && typeof symbol != "undefined")) {
                        return
                    }
                    update('poloniex', tickerCode, parseFloat(args[1]))
                })
            }
        } catch (error) {
            status('poloniex', 'error', error.toString())
        }

        Sockets.poloniex.onclose = function() {
            status('poloniex', 'close')
        }
        Sockets.poloniex.open()
    },
    makeSocket: function(url, title, onMessage, send) {
        var params, socket

        if (typeof url != "string" || typeof title != "string") {
            return false
        }
        if (typeof Sockets[title] === "undefined") {
          Sockets[title] = []
        }
        socket = new WebSocket.Client(url)
        Sockets[title].push(socket)
        params = {}
        if (typeof send !== 'undefined') {
            if (typeof send === 'string') {
                params = { symbol: send }
            } else if (send.pair) {
                params = { symbol: send.pair }            
            }
        }
        var loser = function (reason) {
            params.diagnostic = reason
            status(title, 'error', params)
            return false
         }

        try { /* jshint unused: false */
            socket.on('open', function(event) {
              status(title, 'open', params)
            })
        } catch (error) {
            return loser(error.toString())
        }
        try {
            socket.on('close', function(event) {
                params.diagnostic = (event) && (event.code !== 1000) && (event.reason)
                status(title, 'close', params)
            })
        } catch (error) {
            return loser(error.toString())
        }
        if (typeof onMessage == "function") {
            socket.on('message', onMessage)
        }
        if (typeof send == "object" && !(send instanceof Array)) {
            // parse an object to send ?
            try {
                socket.send(JSON.stringify(send))
            } catch (error) {
                return loser(error.toString())
            }
        } else if (typeof send != "undefined" && send instanceof Array) {
            send.filter(function(o) {
                socket.send(JSON.stringify(o))
            })
        } else if (typeof send != "undefined") {
            try {
                socket.send(JSON.stringify(send))
            } catch (error) {
                return loser(error.toString())
            }
        }
        return true
    },
    'start': function(exchange, symbols) {
        var self = this

        if (typeof exchange == "undefined") {
            supportedExchanges.filter(function(e) {
                if (exports.debugP) console.log(e)
                self[e](symbols)
            })
        } else {
            var exchanges = exchange

            if (typeof exchanges === 'string') exchanges = [ exchanges ]
            exchanges.filter(function(exchange) {
                try {
                    self[exchange](symbols)
                } catch (error) {
                    status(exchange, 'error', { symbols: symbols, diagnostic:  error.toString() })
                }
            })
        }
    },
    'stop': function(socket) {
        // only for the faye socket libraries?
        if (typeof Sockets[socket] != "undefined") {
          if (Sockets[socket] instanceof Array) {
              Sockets[socket].forEach((socket) => { socket.close() })
            } else {
                Sockets[socket].close()
            }
            Sockets[socket] = undefined
            return true
        }
        return false
    }

}
// idea make into object that can take a start constructor with options ... and returns an object with the getQuote method.
