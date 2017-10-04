cryptoSocket = require(".");

cryptoSocket.start();

setInterval(
  function(){
            cryptoSocket.echoExchange()
                
  },1000
);
