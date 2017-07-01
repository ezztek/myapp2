/*
 * This file launches the application by asking Ext JS to create
 * and launch() the Application class.
 */
Ext.application({
    extend: 'myapp2.Application',

    name: 'myapp2',

    requires: [
        // This will automatically load all classes in the myapp2 namespace
        // so that application classes do not need to require each other.
        'myapp2.*'
    ],

    // The name of the initial view to create.
    mainView: 'myapp2.view.main.Main'
});
