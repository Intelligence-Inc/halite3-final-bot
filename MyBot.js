const hlt = require('./hlt');
const { Direction, Position } = require('./hlt/positionals');
const logging = require('./hlt/logging');

const game = new hlt.Game();
game.initialize().then(async () => {
   // At this point "game" variable is populated with initial map data.
   // This is a good place to do computationally expensive start-up pre-processing.
   // As soon as you call "ready" function below, the 2 second per turn timer will start.

   const MAX_HALITE = hlt.constants.MAX_HALITE;
   const MAX_TURNS = hlt.constants.MAX_TURNS;
   const SHIP_COST = hlt.constants.SHIP_COST;
   const DROPOFF_COST = hlt.constants.DROPOFF_COST;

   const { gameMap, me } = game;


   var avgHalite = 0;
   var totalHalite = 0;
   function findAvgHalite() {
      const despacito = [];
      for (let i=0; i<gameMap.width; i++) {
         for (let j=0; j<gameMap.height; j++) {
            despacito.push(gameMap.get(new Position(i,j)).haliteAmount)
         }
      }
      const add = (x,y) => x + y;
      totalHalite = despacito.reduce(add);
      avgHalite = totalHalite / despacito.length;
      logging.info("\u03BC=" + avgHalite);
   }
   findAvgHalite();

   var dropoffQueue = [1000];
   var dropoffsRequired = 0;

   var amountMinimum;
   var amountMaximum = MAX_HALITE * 0.90;
   var stoplist = [0.45, 0.5, 0.55, 0.6, 0.7];
   var shiplist = [36, 44, 52, 60, 68];

   var whenToStopMakingShips = MAX_TURNS * stoplist[gameMap.height / 8 - 4];
   var maxShips = shiplist[gameMap.height / 8 - 4];

   const fD = 5;
   
   logging.info(`No ships will be made after ${whenToStopMakingShips} turns.`);
   logging.info(`No ships will be made after the bot reaches ${maxShips} ships.`)

   if (game.players.size === 2) {
      if (gameMap.height >= 40 && gameMap.height <= 48 && avgHalite >= 125) {
         dropoffQueue.push(Math.floor(MAX_TURNS * .15))
      }
      if (gameMap.height === 48 && avgHalite >= 150) {
         dropoffQueue.push(Math.floor(MAX_TURNS * .45))
      }
      if (gameMap.height === 56) {
         if (avgHalite >= 110) {
            dropoffQueue.push(Math.floor(MAX_TURNS * .15))
         }
         if (avgHalite >= 155) {
            dropoffQueue.push(Math.floor(MAX_TURNS * .4))
         }
         if (avgHalite >= 185) {
            dropoffQueue.push(Math.floor(MAX_TURNS * .55))
         }
      }
      if (gameMap.height === 64) {
         if (avgHalite >= 105) {
            dropoffQueue.push(Math.floor(MAX_TURNS * .15))
         }
         if (avgHalite >= 145) {
            dropoffQueue.push(Math.floor(MAX_TURNS * .4))
         }
         if (avgHalite >= 170) {
            dropoffQueue.push(Math.floor(MAX_TURNS * .55))
         }
      }
   }

   if (game.players.size === 4) {
      if (gameMap.height >= 48 && avgHalite >= 115) {
         dropoffQueue.push(Math.floor(MAX_TURNS * .15))
      }
   }

   var shipIds = [];
   var shipStates = [];
   var shipRands = [];
   var shipDestinations = [];
   
   
   var dropoffMade = 10000;

   

   var dropoffMakerIsClosest = false;


   var dropoffLocation = new Position(0,0);
   var dropoffId = -1;

   var attackerID = -1;
   var attackerReplace;
   var attackerTargetID;
   var targetReplace;
   var retrieverID = -1;
   var retreiverReplace;

   var opponent;
   for (let i=0; i<game.players.size; i++) {
      if (game.players.get(i).id !== me.id) {
         opponent = game.players.get(i);
      }
   }

   var maxLocation = new Position(0,0);
   var maxAmount = 0;
   function maxScan() {
      for (let i=0; i<gameMap.width; i++) {
         for (let j=0; j<gameMap.height; j++) {
            if (gameMap.get(new Position(i,j)).haliteAmount > maxAmount) {
               maxLocation = (i,j);
               maxAmount = gameMap.get(new Position(i,j)).haliteAmount
            }
         }
      }
   }

   function nearestYard(position) {
      let returnDestination = me.shipyard.position;
      for (const dropoff of me.getDropoffs()) {
         if (gameMap.calculateDistance(position, dropoff.position) <= gameMap.calculateDistance(position, returnDestination)) {
            returnDestination = dropoff.position;
         }
      }
      return returnDestination;
   }

   function dropoffScan(min, max) {
      let tempVar = 0;
      for (let i=0; i<gameMap.width; i++) {
         for (let j=0; j<gameMap.height; j++) {
            const distance = gameMap.calculateDistance(me.shipyard.position, new Position(i,j));
            let amount = 0;
            for (let h=-1; h<=1; h++) {
               for (let k=-1; k<=1; k++) {
                  amount = amount + gameMap.get(new Position(i+h,j+k)).haliteAmount;
               }
            }
            const nearEnemyShipyard = game.players.size === 2 && gameMap.calculateDistance(new Position(i,j), opponent.shipyard.position) <= 6;
            if (distance > gameMap.height * min && distance < gameMap.height * max && !gameMap.get(new Position(i,j)).hasStructure && !nearEnemyShipyard) {
               if (amount > tempVar) {    
                  tempVar = amount;
                  dropoffLocation = new Position(i,j);
               }
               if (amount === tempVar && distance < gameMap.calculateDistance(me.shipyard.position, dropoffLocation)) {    
                  tempVar = amount;
                  dropoffLocation = new Position(i,j);
               }
            }
         }
      }
   }

   function inspirationScan() {
      for (const enemyShip of opponent.getShips()) {
         cellIsOccupiedByEnemy[enemyShip.position.x][enemyShip.position.y] = true;
      }
      for (let i=0; i<gameMap.width; i++) {
         for (let j=0; j<gameMap.height; j++) {

            let numberOfEnemies = 0;
            let position = new Position(i,j);
            for (let h=-4; h<=4; h++) {
               for (let k=-4; k<=4; k++) {
                  let scanPos = gameMap.normalize(new Position(i+h,j+k));
                  if (gameMap.calculateDistance(scanPos, position) <= 4) {
                     if (cellIsOccupiedByEnemy[scanPos.x][scanPos.y]) {
                        numberOfEnemies++;
                     }
                  }
               }
            }
            if (numberOfEnemies >= 2) {
               cellIsInspired[i][j] = true;
            }
         }
      }
   } 

   function speedScan(position) {
      let bestSpeed = new Position(0,0);
      let tempVar = 0;
      for (let i=0; i<gameMap.width; i++) {
         for (let j=0; j<gameMap.height; j++) {
            const scanPos = new Position (i,j);
            if (gameMap.calculateDistance(scanPos, position) > 0) {

               // speed scan distance limit
               let speed = gameMap.get(new Position(i,j)).haliteAmount 
               / (gameMap.calculateDistance(new Position(i,j), position) + gameMap.calculateDistance(scanPos, nearestYard(scanPos)));
               speed = speed * 0.25;
               if (cellIsInspired[i][j] && false) {
                  speed = speed + 2.00 * speed;
               }

               if (speed > tempVar && !cellIsTargeted[i][j] && gameMap.get(new Position(i,j)).haliteAmount >= amountMinimum) {
                     tempVar = speed;
                     bestSpeed = new Position(i,j);
               }
            }
         }
      }
      cellIsTargeted[bestSpeed.x][bestSpeed.y] = true;
      return bestSpeed;
   }

   function decideMovement(ship) {

      const myIndex = shipIds.indexOf(ship.id);
      const myState = shipStates[myIndex];

      


      if (myState === "suicide") {
         // suicide gameloop
         const destination = nearestYard(ship.position)
         return destination;
      } else if (myState === "dropoff") {
         const destination = dropoffLocation;
         return destination;
      } else if (myState === "attack") {
         logging.info("attacker has id " + ship.id);
         
         let destination = ship.position;
         if (typeof opponent.getShip(attackerTargetID) !== "undefined") {
            destination = opponent.getShip(attackerTargetID).position;
         }
         return destination;
      } else if (myState === "returning") {
         const destination = nearestYard(ship.position)
         return destination;
      } else if (myState === "early follower") {
         const destination = new Position(dropoffLocation.x + (myIndex % 7) - 3, dropoffLocation.y + (myIndex % 7) - 3);
         return destination;
      } else if (myState === "follower") {
         let destination = me.getDropoffs()[shipIds.indexOf(ship.id) % me.getDropoffs().length].position;
         destination = new Position(destination.x + (myIndex % (fD * 2 + 1)) - fD, destination.y + (myIndex % (fD * 2 + 1)) - fD);
         if (false && me.getDropoffs().length < dropoffsRequired) {
            destination = new Position(dropoffLocation.x + (myIndex % (fD * 2 + 1)) - fD, dropoffLocation.y + (myIndex % (fD * 2 + 1)) - fD);
         }
         return destination;
      } else if (myState === "collecting") {
         if (gameMap.get(ship.position).haliteAmount < amountMinimum
          && gameMap.get(gameMap.normalize(ship.position.directionalOffset(Direction.North))).haliteAmount < amountMinimum
          && gameMap.get(gameMap.normalize(ship.position.directionalOffset(Direction.South))).haliteAmount < amountMinimum
          && gameMap.get(gameMap.normalize(ship.position.directionalOffset(Direction.East))).haliteAmount < amountMinimum
          && gameMap.get(gameMap.normalize(ship.position.directionalOffset(Direction.West))).haliteAmount < amountMinimum
         ) {
            return speedScan(ship.position);
         }
         const discount = 0.8;

         const directions = Direction.getAllCardinals();
         let bestDirection = Direction.Still;
         let bestAmount = gameMap.get(ship.position).haliteAmount * 0.4375;
         for (const direction of directions) {
            const collectionCost = gameMap.get(gameMap.normalize(ship.position.directionalOffset(direction))).haliteAmount * 0.25 * discount - 0.1 * gameMap.get(ship.position).haliteAmount;
            if (collectionCost > bestAmount) {
               bestAmount = collectionCost;
               bestDirection = direction;
            }
         }
         const destination = ship.position.directionalOffset(bestDirection);
         return destination;
      } else {
            logging.debug("Unexpected ship state");
      }
   }

   function smartNavigate(ship, target) {
      const shiprand = shipRands[shipIds.indexOf(ship.id)];
      const acceptableValues = [-1, ship.id];
      const haliteOnMySquare = gameMap.get(ship.position).haliteAmount;
      const destination = gameMap.normalize(target);
      const smartMoves = gameMap.getUnsafeMoves(ship.position, destination);

      if (smartMoves.length === 0 || ship.haliteAmount < haliteOnMySquare * 0.1) {
         cellStates[ship.position.x][ship.position.y] = ship.id;
         return Direction.Still;
      }
      if (false && shipStates[shipIds.indexOf(ship.id)] === "returning" && gameMap.get(destination).isOccupied &&!acceptableValues.includes(cellStates[destination.x][destination.y])) {
         cellStates[ship.position.x][ship.position.y] = ship.id;
         return Direction.Still;
      }
      //able to move:
      var moves = [];
      for (const move of smartMoves) {
         const nowDestination = gameMap.normalize( ship.position.directionalOffset(move) );
         let safe = !cellIsOccupiedByEnemy[nowDestination.x][nowDestination.y];

         if (shipStates[shipIds.indexOf(ship.id)] === "attack" || gameMap.calculateDistance(me.shipyard.position, nowDestination) === 0) {
            safe = true;
         }

         if ( acceptableValues.includes( cellStates[nowDestination.x][nowDestination.y] ) && safe) {
            moves.push(move);
         }
      }
      if (moves.length > 0) {
         const finalMove = moves[Math.floor(moves.length * shiprand)];
         const finalDestination = gameMap.normalize( ship.position.directionalOffset(finalMove) );
         cellStates[finalDestination.x][finalDestination.y] = ship.id;
         return finalMove;
      }
      
      //gets off the shipyard
      let onDropoff = false;
      for (const dropoff of me.getDropoffs()) {
         if (gameMap.calculateDistance(ship.position, dropoff.position) === 0) {
            onDropoff = true;
         }
      }    
      const allMoves = Direction.getAllCardinals();
      if (shipStates[shipIds.indexOf(ship.id)] === "dropoff" || shipStates[shipIds.indexOf(ship.id)] === "returning" || gameMap.calculateDistance(ship.position, me.shipyard.position) === 0 || onDropoff) {
         let moves = [];
         for (const move of allMoves) {
            const nowDestination = gameMap.normalize( ship.position.directionalOffset(move) );
            let safe = !cellIsOccupiedByEnemy[nowDestination.x][nowDestination.y];

            if (gameMap.calculateDistance(me.shipyard.position, nowDestination) === 0) {
               safe = true;
            }

            if ( acceptableValues.includes( cellStates[nowDestination.x][nowDestination.y] ) && safe) {
               moves.push(move);
            }
         }
         if (moves.length > 0) {
            const finalMove = moves[Math.floor(moves.length * shiprand)];
            const finalDestination = gameMap.normalize( ship.position.directionalOffset(finalMove) );
            cellStates[finalDestination.x][finalDestination.y] = ship.id;
            return finalMove;
         }
      }
      //if all else fails
      if (shipStates[shipIds.indexOf(ship.id)] === "suicide" && gameMap.calculateDistance(ship.position, destination) === 1) {
         const finalMove = smartMoves[0];
         const finalDestination = gameMap.normalize( ship.position.directionalOffset(finalMove) );
         cellStates[finalDestination.x][finalDestination.y] = ship.id;
         return finalMove;
      }
      cellStates[ship.position.x][ship.position.y] = ship.id;
      return Direction.Still;
   }

   await game.ready('TurtleBot v1.0');

   logging.info(`My Player ID is ${game.myId}.`);
   // random comment

   // READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY READY 
   while (true) {
      await game.updateFrame();

      const { gameMap, me } = game;

      const commandQueue = [];

      var cellStates = Array(gameMap.width).fill().map( () => Array(gameMap.height).fill(-1) );

      var cellIsTargeted = Array(gameMap.width).fill().map( () => Array(gameMap.height).fill(false) );
      
      var cellIsOccupiedByEnemy = Array(gameMap.width).fill().map( () => Array(gameMap.height).fill(false) );
      var cellIsInspired = Array(gameMap.width).fill().map( () => Array(gameMap.height).fill(false) );
      inspirationScan();
   

      findAvgHalite();



      const ratio1 = 0.5;
      const ratio2 = 0.5;
      const turnRatio = 0.2;
      if (game.turnNumber / MAX_TURNS < turnRatio) {
         amountMinimum = avgHalite * (ratio1 + ( (ratio2 - ratio1) / turnRatio * (game.turnNumber / MAX_TURNS) ) );
      } else {
         amountMinimum = avgHalite * ratio2;
      }
      amountMinimum = avgHalite * 0.5;

      if (amountMinimum < 30) {
         amountMinimum = 30;
      }
      

      if (dropoffQueue.includes(game.turnNumber)) {
         dropoffsRequired = dropoffQueue.indexOf(game.turnNumber);
         for (const ship of me.getShips()) {
            dropoffId = ship.id;
         }
      }
      if (me.getDropoffs().length < dropoffsRequired && dropoffQueue.length > 0) {
         if (dropoffsRequired === 0 || game.turnNumber > dropoffQueue[dropoffsRequired] + MAX_TURNS * 0.1) {

         } else if (dropoffsRequired === 1) {
            dropoffScan(0.25, 0.45)
         } else {
            dropoffScan(0.2, 0.75)
         }
      }

      var amountMaximum = MAX_HALITE * 0.95;

      // ATTACK ATTACK ATTACK ATTACK 
      attackerReplace = true;
      for (const ship of me.getShips()) {
         if (ship.id === attackerID) {
            attackerReplace = false;
         }
      }
      targetReplace = true;
      for (const enemyShip of opponent.getShips()) {
         if (enemyShip.id === attackerTargetID) {
            targetReplace = false;
         }
      }
      if (game.players.size === 2 && avgHalite <= 50) {
         let found = false;
         let targetShip;
         if (attackerReplace || targetReplace) {
            if (me.getShips().length > 7 && opponent.getShips().length > 0) {
               targetShip = opponent.getShips()[0];
               let tempVar = 1000;
               for (const ship of me.getShips()) {
                  for (const enemyShip of opponent.getShips()) {
                     if (gameMap.calculateDistance(ship.position, enemyShip.position) < tempVar && ship.haliteAmount < 250 && enemyShip.haliteAmount >= 250) {
                        tempVar = gameMap.calculateDistance(ship.position, enemyShip.position);
                        attackerID = ship.id;
                        targetShip = enemyShip;
                        found = true;
                     }
                  }
               }  
            }
         }
         if (found) {
            attackerTargetID = targetShip.id;
         } else {
            attackerID = -1;
            attackerTargetID = -1;
         }
      }
      logging.info(attackerID + " => " + attackerTargetID);


      // STAGE ONE
         if ( !(shipIds.includes(ship.id)) ) {
            shipIds.push(ship.id);
         }
         const myIndex = shipIds.indexOf(ship.id);

         if ( typeof shipRands[myIndex] === "undefined" ) {
            shipRands.push("0");
         }
         shipRands[myIndex] = Math.random();

         let onDropoff = false;
         let nearDropoff = false;
         for (const dropoff of me.getDropoffs()) {
            if (gameMap.calculateDistance(ship.position, dropoff.position) === 0) {
               onDropoff = true;
            }
            if (gameMap.calculateDistance(ship.position, dropoff.position) <= fD * 2) {
               nearDropoff = true;
            }
         }

         // PRE SHIP STATE
         const earlyfollower = dropoffMakerIsClosest && (me.getDropoffs().length < dropoffsRequired || (me.getDropoffs().length === dropoffsRequired && gameMap.calculateDistance(ship.position, me.shipyard.position) === 0) ) && dropoffsRequired === 1 && game.turnNumber < dropoffMade + MAX_TURNS * 0.1 && ship.haliteAmount < 500;
         
         const follower = me.getDropoffs().length >= 2 && gameMap.calculateDistance(ship.position, me.shipyard.position) === 0;
         // shipstate setter
         const suicideDestination = nearestYard(ship.position);
         const suicideDistance = gameMap.calculateDistance(ship.position, suicideDestination);

         if (game.turnNumber > MAX_TURNS - suicideDistance - gameMap.height * 0.25) {
            shipStates[myIndex] = "suicide";
         } else if (ship.id === dropoffId && game.turnNumber >= dropoffQueue.indexOf(dropoffsRequired) && me.haliteAmount >= DROPOFF_COST) {
            dropoffMakerIsClosest = true;
            for (const otherShip of me.getShips()) {
               if (otherShip.id !== ship.id && gameMap.calculateDistance(otherShip.position, dropoffLocation) <= gameMap.calculateDistance(ship.position, dropoffLocation) - 4) {
                  // how close for dropoff m
                  dropoffMakerIsClosest = false;
               }
            }
            shipStates[myIndex] = "dropoff";
         } else if ((earlyfollower || shipStates[myIndex] === "early follower") && gameMap.calculateDistance(ship.position, dropoffLocation) > 6) {
            shipStates[myIndex] = "early follower";
         } else if ( (ship.haliteAmount > amountMaximum || shipStates[myIndex] === "returning") && gameMap.calculateDistance(ship.position, me.shipyard.position) !== 0 && !onDropoff) {
         // if over x halite, set to returning
            shipStates[myIndex] = "returning";
         } else if ((follower || shipStates[myIndex] === "follower") && !nearDropoff) {
            shipStates[myIndex] = "follower";
         } else if (ship.id === attackerID) {
            shipStates[myIndex] = "attack";
         } else {
            shipStates[myIndex] = "collecting";
         }

         shipDestinations[myIndex] = decideMovement(ship);
      }
      logging.info(shipStates.includes("follower"));

      // STAGE TWO
      for (let i=0; i<10; i++) {
         for (const ship of me.getShips()) {
            const myDestination = shipDestinations[shipIds.indexOf(ship.id)];
            smartNavigate(ship, myDestination);
         }
      }

      // STAGE THREE
      for (const ship of me.getShips()) {
         const myDestination = shipDestinations[shipIds.indexOf(ship.id)];
         let nearDropoff = false;
         for (const dropoff of me.getDropoffs()) {
            if (gameMap.calculateDistance(ship.position, dropoff.position) <= 1) {
               nearDropoff = true;
            }
         }

         if (shipStates[shipIds.indexOf(ship.id)] === "suicide" && (gameMap.calculateDistance(ship.position, me.shipyard.position) <= 1  || nearDropoff) ) {
            
            const unsafeMoves = gameMap.getUnsafeMoves(ship.position, myDestination);
            if (unsafeMoves.length !== 0) {
               commandQueue.push(ship.move(unsafeMoves[0]));
            }
         } else if (shipStates[shipIds.indexOf(ship.id)] === "dropoff" && gameMap.calculateDistance(ship.position, dropoffLocation) === 0 && me.haliteAmount >= DROPOFF_COST - gameMap.get(dropoffLocation).haliteAmount - ship.haliteAmount) {
            commandQueue.push(ship.makeDropoff());
            dropoffMade = game.turnNumber;
         } else {
            const myDestination = shipDestinations[shipIds.indexOf(ship.id)];
            const safeMove = smartNavigate(ship, myDestination);
            commandQueue.push(ship.move(safeMove));
         }
      }

      // STAGE FOUR
      if ( (game.turnNumber < dropoffQueue.indexOf(dropoffsRequired) 
      || (me.getDropoffs().length >= dropoffsRequired || dropoffQueue.length === 0 || me.haliteAmount >= DROPOFF_COST + SHIP_COST)
      )
      && game.turnNumber < whenToStopMakingShips && me.haliteAmount >= SHIP_COST && me.getShips().length < maxShips && cellStates[me.shipyard.position.x][me.shipyard.position.y] === -1) 
      {
         commandQueue.push(me.shipyard.spawn());
      }

      await game.endTurn(commandQueue);
   }
});
