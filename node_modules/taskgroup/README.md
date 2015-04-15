
<!-- TITLE/ -->

# TaskGroup

<!-- /TITLE -->


<!-- BADGES/ -->

[![Build Status](http://img.shields.io/travis-ci/bevry/taskgroup.png?branch=master)](http://travis-ci.org/bevry/taskgroup "Check this project's build status on TravisCI")
[![NPM version](http://badge.fury.io/js/taskgroup.png)](https://npmjs.org/package/taskgroup "View this project on NPM")
[![Gittip donate button](http://img.shields.io/gittip/bevry.png)](https://www.gittip.com/bevry/ "Donate weekly to this project using Gittip")
[![Flattr donate button](http://img.shields.io/flattr/donate.png?color=yellow)](http://flattr.com/thing/344188/balupton-on-Flattr "Donate monthly to this project using Flattr")
[![PayPayl donate button](http://img.shields.io/paypal/donate.png?color=yellow)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=QB8GQPZAH84N6 "Donate once-off to this project using Paypal")

<!-- /BADGES -->


<!-- DESCRIPTION/ -->

Group together synchronous and asynchronous tasks and execute them with support for concurrency, naming, and nesting.

<!-- /DESCRIPTION -->


<!-- INSTALL/ -->

## Install

### [Node](http://nodejs.org/), [Browserify](http://browserify.org/)
- Use: `require('taskgroup')`
- Install: `npm install --save taskgroup`

### [Ender](http://ender.jit.su/)
- Use: `require('taskgroup')`
- Install: `ender add taskgroup`

<!-- /INSTALL -->


## Usage

### Example

``` javascript
// Import
var TaskGroup = require('taskgroup').TaskGroup;

// Create our new group
var group = new TaskGroup();

// Define what should happen once the group has completed
group.once('complete', function(err, results){
	// Log the error that has occured
	console.log(err);
	// => null

	// Log the results that our group received from the executing items
	console.log(JSON.stringify(results));
	/*	=>
		[
			[null, 'first', 'task'],
			[null, 'second task'],
			[null, [
				[null, 'sub second task'],
				[null, 'sub first', 'task']
			]]
		]
	*/
});

// Add an asynchronous task that gives the result to the completion callback
group.addTask(function(complete){
	setTimeout(function(){
		complete(null, 'first', 'task');
	},500);
});

// Add a synchronous task that returns the result
// Errors should be returned, though if an error is thrown we will catch it
group.addTask(function(){
	return 'second task';
});

// Add a sub-group to our exiting group
group.addGroup(function(addGroup, addTask){
	// Tell this sub-group to execute in parallel (all at once) by setting its concurrency to unlimited
	// by default the concurrency for all groups is set to 1
	// which means that they execute in serial fashion (one after the other, instead of all at once)
	this.setConfig({concurrency:0});

	// Add an asynchronous task that gives its result to the completion callback
	addTask(function(complete){
		setTimeout(function(){
			complete(null, 'sub first', 'task');
		},500);
	});

	// Add a synchronous task that returns its result
	addTask(function(){
		return 'sub second task';
	});
});

// Execute our group
group.run();
```

### TaskGroup API

``` javascript
new (require('taskgroup')).TaskGroup()
```

- Available methods:
	- `constructor(name?,fn?)` - create our new group, arguments can be a String for `name`, an Object for `config`, and a Function for `next`
	- `setConfig(config)` - set the configuration for the group, returns chain
	- `getconfig()` - return the set configuration
	- `addTask(args...)`, `addTasks(tasks, args..)`  - create a new task item with the arguments and adds it to the group, returns the new task item(s)
	- `addGroup(args...)`, `addGroups(groups, args..)` - create a new group item with the arguments and adds it to the group, returns the new group item(s)
	- `addItem(item)`, `addItem(items)`  - adds the items to the group, returns the item(s)
	- `getTotals()` - returns counts for the following `{running,remaining,completed,total}`
	- `clear()` - remove the remaining items to be executed
	- `pause()` - pause the execution of the items
	- `stop()` - clear and pause
	- `exit(err)` - stop and complete, `err` if specified is sent to the completion event when fired
	- `complete()` - will fire the completion event if we are already complete, useful if you're binding your listeners after run
	- `run()` - start/resume executing the items, returns chain
	- All those of [EventEmitter2](https://github.com/hij1nx/EventEmitter2)
- Available configuration:
	- `name`, no default - allows us to assign a name to the group, useful for debugging
	- `method(addGroup, addTask, complete?)`, no default - allows us to use an inline and self-executing style for defining groups, useful for nesting
	- `concurrency`, defaults to `1` - how many items shall we allow to be run at the same time, set to `0` to allow unlimited
	- `pauseOnError`, defaults to `true` - if an error occurs in one of our items, should we stop executing any remaining items?
		- setting to `false` will continue with execution with the other items even if an item experiences an error
	- `items` - alias for  `.addTasks(items)`
	- `groups` - alias for  `.addGroups(groups)`
	- `tasks` - alias for  `.addTasks(tasks)`
	- `next` - alias for  `.once('complete', next)`
- Available events:
	- `run()` - fired just before we execute the items
	- `complete(err, results)` - fired when all our items have completed
	- `task.run(task)` - fired just before a task item executes
	- `task.complete(task, err, args...)` - fired when a task item has completed
	- `group.run(group)` - fired just before a group item executes
	- `group.complete(group, err, results)` - fired when a group item has completed
	- `item.run(item)` - fired just before an item executes (fired for both sub-tasks and sub-groups)
	- `item.complete(item, err, args...)` - fired when an item has completed (fired for both sub-task and sub-groups)


### Task API

``` javascript
new (require('taskgroup')).Task()
```

- Available methods:
	- `constructor(args...)` - create our new task, arguments can be a String for `name`, an Object for `config`, and a Function for `next`
	- `setConfig(config)` - set the configuration for the group, returns chain
	- `getconfig()` - return the set configuration
	- `complete()` - will fire the completion event if we are already complete, useful if you're binding your listeners after run
	- `run()` - execute the task
- Available configuration:
	- `name`, no default - allows us to assign a name to the group, useful for debugging
	- `method(complete?)`, no default - must be set at some point, it is the function to execute for the task, if it is asynchronous it should use the completion callback provided
	- `args`, no default - an array of arguments that you would like to precede the completion callback when executing `fn`
	- `next` - alias for  `.once('complete', next)`
- Available events:
	- `run()` - fired just before we execute the task
	- `complete(err, args...)` - fired when the task has completed


## Comparison with [Async.js](https://github.com/caolan/async)

The biggest advantage and difference of TaskGroup over async.js is that TaskGroup has one uniform API to rule them all, whereas with async.js I found that I was always having to keep referring to the async manual to try and figure out which is the right call for my use case then somehow wrap my head around the async.js way of doing things (which more often than not I couldn't), whereas with TaskGroup I never have that problem as it is one consistent API for all the different use cases.

Let's take a look at what the most common async.js methods would look like in TaskGroup:

``` javascript
// ====================================
// Series

// Async
async.series([
	function(){},
	function(callback){callback();}
], next);

// TaskGroup
new TaskGroup({
	tasks: [
		function(){},
		function(callback){callback();}
	],
	next: next
}).run();


// ====================================
// Parallel

// Async
async.parallel([
	function(){},
	function(callback){callback();}
], next);

// TaskGroup
new TaskGroup({
	concurrency: 0,
	tasks: [
		function(){},
		function(callback){callback();}
	],
	next: next
}).run();

// ====================================
// Map

// Async
async.map(['file1','file2','file3'], fs.stat, next);

// TaskGroup
new TaskGroup({
	concurrency: 0,
	tasks: ['file1', 'file2', 'file3'].map(function(file){
		return function(complete){
			fs.stat(file, complete);
		}
	}),
	next: next
}).run();
```

Another big advantage of TaskGroup over async.js is TaskGroup's ability to add tasks to the group once execution has already started - this is a common use case when creating an application that must perform it's actions serially, so using TaskGroup you can create a serial TaskGroup for the application, run it right away, then add the actions to the group as tasks.

A final big advantage of TaskGroup over async.js is TaskGroup's ability to do nested groups, this allowed us to created the [Joe Testing Framework & Runner](https://github.com/bevry/joe) incredibly easily, and because of this functionality Joe will always know which test (task) is associated to which suite (task group), whereas test runners like mocha have to guess (they add the task to the last group, which may not always be the case! especially with dynamically created tests!).


<!-- HISTORY/ -->

## History
[Discover the change history by heading on over to the `History.md` file.](https://github.com/bevry/taskgroup/blob/master/History.md#files)

<!-- /HISTORY -->


<!-- CONTRIBUTE/ -->

## Contribute

[Discover how you can contribute by heading on over to the `Contributing.md` file.](https://github.com/bevry/taskgroup/blob/master/Contributing.md#files)

<!-- /CONTRIBUTE -->


<!-- BACKERS/ -->

## Backers

### Maintainers

These amazing people are maintaining this project:

- Benjamin Lupton <b@lupton.cc> (https://github.com/balupton)

### Sponsors

No sponsors yet! Will you be the first?

[![Gittip donate button](http://img.shields.io/gittip/bevry.png)](https://www.gittip.com/bevry/ "Donate weekly to this project using Gittip")
[![Flattr donate button](http://img.shields.io/flattr/donate.png?color=yellow)](http://flattr.com/thing/344188/balupton-on-Flattr "Donate monthly to this project using Flattr")
[![PayPayl donate button](http://img.shields.io/paypal/donate.png?color=yellow)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=QB8GQPZAH84N6 "Donate once-off to this project using Paypal")

### Contributors

These amazing people have contributed code to this project:

- Benjamin Lupton <b@lupton.cc> (https://github.com/balupton) - [view contributions](https://github.com/bevry/taskgroup/commits?author=balupton)
- sfrdmn (https://github.com/sfrdmn) - [view contributions](https://github.com/bevry/taskgroup/commits?author=sfrdmn)

[Become a contributor!](https://github.com/bevry/taskgroup/blob/master/Contributing.md#files)

<!-- /BACKERS -->


<!-- LICENSE/ -->

## License

Licensed under the incredibly [permissive](http://en.wikipedia.org/wiki/Permissive_free_software_licence) [MIT license](http://creativecommons.org/licenses/MIT/)

Copyright &copy; 2013+ Bevry Pty Ltd <us@bevry.me> (http://bevry.me)
<br/>Copyright &copy; 2011-2012 Benjamin Lupton <b@lupton.cc> (http://balupton.com)

<!-- /LICENSE -->


