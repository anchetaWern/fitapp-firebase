var Observable = require("data/observable").Observable;
var geolocation = require("nativescript-geolocation");

var mapsModule = require("nativescript-google-maps-sdk");
var pageModule = require("tns-core-modules/ui/page");

var { Accuracy } = require("ui/enums");

var dialogs = require("ui/dialogs");

var fecha = require('fecha');

var firebase = require("nativescript-plugin-firebase");
var http = require("http");

var applicationSettings = require("application-settings");

function createViewModel(db) {
    var viewModel = new Observable();
    var watchId;
    var start_location;
    var current_location;

    viewModel.is_tracking = false;
    viewModel.latitude = 15.447819409392789;
    viewModel.longitude = 120.93888133764267;
    viewModel.zoom = 20;

    var total_distance = 0;
    var total_steps = 0;

    var locations = [];

    var mapView;
    var marker = new mapsModule.Marker();

    if (!geolocation.isEnabled()) {
        geolocation.enableLocationRequest();
    } 

    var walk_id;

    var month = fecha.format(new Date(), 'MM');
    var year = fecha.format(new Date(), 'YYYY');
   
    function commafy(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    var walks = [];
    viewModel.walks = [];
    viewModel.has_walks = false;

    viewModel.is_loggedin = false;
    viewModel.profile_photo = '';
    viewModel.user_name = '';

    var st_datetime;

    firebase.init({
        persist: true, 
        onAuthStateChanged: function (data) { 
            
            // todo: add code for when the auth status changes
            
        }
      
    }).then(
        function(instance){
          console.log("firebase.init done");
        },
        function(error){
          console.log("firebase.init error: " + error);
        }
    );


    db.all(
        "SELECT * FROM walks WHERE strftime('%m', start_datetime) == ? AND strftime('%Y', start_datetime) == ? ORDER BY start_datetime DESC", 
        [month, year]
    ).then((err, rs) => {
        if(!err){

            rs.forEach((w) => {
                let start_datetime = new Date(w[3]);
                let end_datetime = new Date(w[4]);
                
                walks.push({
                    start: fecha.format(start_datetime, 'MMM D, h:mm'),
                    end: fecha.format(end_datetime, 'h:mm a'),
                    distance: commafy(w[1]) + 'm',
                    steps: commafy(w[2])
                });

            });

            if(walks.length){
                viewModel.set('has_walks', true);
            }
            viewModel.set('walks', walks);

        }  
    });


    viewModel.clearData = function() {

        dialogs.confirm("Are you sure you want to clear your data?").then((agree) => {
            
            if(agree){
                db.execSQL("DELETE FROM walks", []).then(
                    (err) => {
                        if(!err){
                            dialogs.alert("Data has been cleared!");
                            walks = [];
                            viewModel.set('walks', []);
                            viewModel.set('has_walks', false);
                        }
                    }
                ); 
            }
        });
        
    }

    viewModel.toggleTracking = function() {
        
        if (geolocation.isEnabled()) {

            this.set('is_tracking', !viewModel.is_tracking);
            if (viewModel.is_tracking) {
                geolocation.getCurrentLocation(
                    {
                        desiredAccuracy: Accuracy.high, 
                        updateDistance: 5, 
                        timeout: 2000
                    }
                ).
                then(function(loc) {

                    if (loc) {
                        
                        start_location = loc;
                        locations.push(start_location);
                        
                        viewModel.set('latitude', loc.latitude);
                        viewModel.set('longitude', loc.longitude);

                        marker.position = mapsModule.Position.positionFromLatLng(viewModel.latitude, viewModel.longitude); 
                        
                        st_datetime = new Date();
                        var start_datetime = fecha.format(st_datetime, 'YYYY-MM-DD HH:mm:ss');
                        
                        db.execSQL(
                            "INSERT INTO walks (total_distance, total_steps, start_datetime) VALUES (?, ?, ?)", 
                            [0, 0, start_datetime]
                        ).then((id) => {
                            walk_id = id; 
                        }, (e) => {
                            dialogs.alert(e.message);
                        });  
                        
                        watchId = geolocation.watchLocation(
                            function (loc) {
                                if (loc) {
                                    current_location = loc;
                                    locations.push(loc);

                                    viewModel.set('latitude', loc.latitude);
                                    viewModel.set('longitude', loc.longitude);
                                    marker.position = mapsModule.Position.positionFromLatLng(viewModel.latitude, viewModel.longitude); 
                                    
                                    location_count = locations.length;

                                    if (location_count >= 2) {
                                        var distance = Math.round(geolocation.distance(locations[location_count - 2], locations[location_count - 1]));
                                        var steps = Math.round(distance * 1.3123);
                                        
                                        total_distance = total_distance + distance;
                                        total_steps = total_steps + steps;

                                        viewModel.set('distance', "distance travelled: " + commafy(total_distance) + " meters");
                                        viewModel.set('steps', "steps: " + commafy(total_steps));

                                    }
                                    
                                }
                            }, 
                            function(e){
                                dialogs.alert(e.message);
                            }, 
                            {
                                desiredAccuracy: Accuracy.high, 
                                updateDistance: 5, 
                                minimumUpdateTime : 5000
                            }
                        );
                       
                    }   

                });

            } else {
                geolocation.clearWatch(watchId);
                
                var ed_datetime = new Date();
                var end_datetime = fecha.format(ed_datetime, 'YYYY-MM-DD HH:mm:ss');
                
                walks.unshift({
                    start: fecha.format(st_datetime, 'MMM D, h:mm'),
                    end: fecha.format(ed_datetime, 'h:mm a'),
                    distance: commafy(total_distance) + 'm',
                    steps: commafy(total_steps)
                });
                
                viewModel.set('walks', walks);
                if(walks.length > 0){
                    viewModel.set('has_walks', true);
                }

                // todo: add code for updating the user's latest steps and distance on Firebase

                db.execSQL(
                    "UPDATE walks SET end_datetime = ?, total_steps = ?, total_distance = ? WHERE id = ?", 
                    [end_datetime, total_steps, total_distance, walk_id]
                ).then(
                    (err, id) => {
                        if(!err){
                            total_distance = 0;
                            total_steps = 0;
                            locations = [];
                            viewModel.set('distance', "distance travelled: " + total_distance + " meters");
                            viewModel.set('steps', "steps: " + total_steps);
                        }
                    }
                );

                
            }

        } else {
            dialogs.alert("Please enable Geolocation");
        }
    }

    viewModel.getButtonStyle = function() {
        if (viewModel.is_tracking) {
            return 'bg-danger';
        }
        return 'bg-primary';
    }

    viewModel.getButtonLabel = function() {
        if (viewModel.is_tracking) {
            return 'Stop Tracking';
        }
        return 'Start Tracking';
    }

    viewModel.onMapReady = function(args) {
        mapView = args.object;
        marker.position = mapsModule.Position.positionFromLatLng(viewModel.latitude, viewModel.longitude);
        marker.userData = { index: 1 };
        mapView.addMarker(marker);
    }


    viewModel.logout = function() {
        // todo: add code for logging a user out
    }

   
    viewModel.loginFacebook = function() {
        // todo: add code for logging in to Facebook
    }

    return viewModel;
}


exports.createViewModel = createViewModel;
