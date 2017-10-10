cryptoSocket = require(".");

cryptoSocket.start(
// [ 'bitfinex', 'bitmex', 'bitstamp', 'cex', 'gdax', 'gemini', 'poloniex' ]
  [ 'cex', 'gdax', 'poloniex' ],
  [ 'BTCUSD', 'ETHUSD', 
    'BTCEUR', 'ETHEUR',
    'BTCGBP', 'ETHGBP'
  ]
);

/*
setInterval(
  function(){
            cryptoSocket.echoExchange()
                
  },1000
);
 */
