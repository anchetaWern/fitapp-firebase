var Sqlite = require("nativescript-sqlite");

var createViewModel = require("./main-view-model").createViewModel;

function onNavigatingTo(args) {    
    var page = args.object;

    var db_name = "walks.db";

    new Sqlite(db_name).then((db) => {
       
        db.execSQL("CREATE TABLE IF NOT EXISTS walks (id INTEGER PRIMARY KEY AUTOINCREMENT, total_distance INTEGER, total_steps INTEGER, start_datetime DATETIME, end_datetime DATETIME)").then((id) => {
            page.bindingContext = createViewModel(db);
        }, (err) => {
            console.log("CREATE TABLE ERROR", err);
        });

    }, (err) => {
        console.log("OPEN DB ERROR", err);
    });
}

exports.onNavigatingTo = onNavigatingTo;