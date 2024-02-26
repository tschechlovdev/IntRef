import {BackendCommunicator} from "./BackendCommunicator";
import {FrontendHandler} from "./FrontendHandler";


//require('script-loader!../src/lib/jquery.js');

//import 'bootstrap';
//require("bootstrap")
require('./css/clustering_communicator.css');


// import 'bootstrap/dist/css/bootstrap.min.css';
// import 'bootstrap/dist/js/bootstrap.min.js';


BackendCommunicator.getInstance().init().then(function () {
    let frontendHandler = new FrontendHandler();
    // set all eventlisteners, etc.
    frontendHandler.init().then(function () {
        BackendCommunicator.getInstance().setFrontend(frontendHandler)
    });

});


