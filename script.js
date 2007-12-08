/* copyright Harpreet Riat (www.riat.co) */
window.onload = function() {
	Game.init();
	document.onmousemove = function(e) {
		Game.onMouseMove(e);
		//Game.debug();
	};
	document.onmouseup = function() {
		Game.onMouseUp();
	};
	if ($('game_button')) {
		$('game_button').onclick = function() {
			Game.reset();
			Game.doneWords.clear();
			var set = 0;
			var difficulty = 0;
			var select = $('word_set');
			if (select) {				
				set = select.options[select.selectedIndex].value;
			}
			var select = $('difficulty');
			if (select) {
				difficulty = select.options[select.selectedIndex].value;
			}
			Game.hintEnabled = $('hint_enabled') && $('hint_enabled').checked;
			Game.loadWord(false, set, difficulty);
		}
	}
}
var DHTML = {
	loading: function(flag) {
		if (flag) this.setStatus(this.getText('loadingnew', 'Loading new word...'));
		else this.setStatus('');
	},
	alert: function(message) {
		alert(message);
	},
	getText: function(code, defaultPhrase) {
		var text = $('text_'+code) ? $('text_'+code).value : false;
		return text || defaultPhrase;
	},
	getConstant: function(code, defaultValue) {
		var value = $('const_'+code) ? $('const_'+code).value : false;
		return parseInt(value || defaultValue);
	},
	setStatus: function(message) {
		if (!this.status) {
			this.status = document.createElement('div');
			this.status.id = 'status';
			document.body.appendChild(this.status);
		}
		this.status.innerHTML = message;
	}
}
var Game = {
	SERVER_URL: '?ajax=1',
	LETTER_WIDTH: 60,//has to be same as in CSS
	LETTER_SPACING: 3,
	LETTER_OVERDRAG: 15,
	ANIMATOR_TIME: 180,
	ANIMATOR_CLOCK: 10,
	SKIP_SHOW_TIME: DHTML.getConstant('skipshowtime', 2) * 1000,
	FLASHER_TIME: 500,
	set: 0,
	difficulty: 0,
	hintEnabled: true,
	stickedLetter: false,
	cacheWord: false,
	timeouts: Array(),
	init: function() {
		this.wordDiv = document.createElement('div');
		this.wordDiv.id = 'word';
		document.body.appendChild(this.wordDiv);
		var buttons = document.createElement('div');
		buttons.id = 'buttons';
		this.submitButton = document.createElement('button');
		this.submitButton.innerHTML = DHTML.getText('submit', 'Submit');
		buttons.appendChild(this.submitButton);
		this.skipButton = document.createElement('button');
		this.skipButton.innerHTML = DHTML.getText('skip', 'Skip');
		buttons.appendChild(this.skipButton);
		document.body.appendChild(buttons);
		this.hintDiv = $('hint');
		this.hintText = $('hint_text');
		this.timer = {
			div: $('timer'),
			getNowTime: function() {
				var d = new Date();
				return Math.ceil(d.getTime()/1000);
			},
			start: function() {
				if (!this.div) return;
				this.setTime();
				this.startTime = this.getNowTime()+1;
				this.interval = window.setInterval('Game.timer.refresh()', 1000);
				this.div.className = '';
			},
			refresh: function() {
				var seconds = this.getNowTime() - this.startTime;
				if (seconds >= 3600) {
					this.expire();
					return;
				}
				var s = seconds % 60;
				var m = ((seconds - s) / 60) % 60;
				this.setTime(m, s);
			},
			stop: function() {
				if (this.interval) window.clearInterval(this.interval);
				this.div.className = 'disabled';
			},
			expire: function() {
				if (!this.div) return;
				this.stop();
				this.div.className = 'expired';
				this.setTime(99, 99);
			},
			setTime: function(m,s) {
				var time = "";
				if (m != undefined && s !=undefined) {
					if (m < 0) m = 0;
					if (s < 0) s = 0;
					m = m < 10 ? "0" + m : m;
					s = s < 10 ? "0" + s : s;
					time = m + ":" + s;
				}
				this.div.innerHTML = time;			
			}
		};
		this.doneWords = {
			div: $('submitted'),
			clearButton: $('clear_div'),
			add: function(word, correct) {
				if (this.div) {
					var d = document.createElement('div');
					d.innerHTML = word;
					this.div.appendChild(d);
					if (!correct) d.className = 'incorrect';
					if (this.clearButton) {
						this.clearButton.style.display = 'block';
						var thisObject = this;
						this.clearButton.onclick = function() {
							thisObject.clear();
							return false;
						}
					}
				}
			},
			clear: function() {
				if (!this.div || !this.clearButton) return;
				this.clearButton.style.display = 'none';
				while(this.clearButton.nextSibling) {
					this.clearButton.parentNode.removeChild(this.clearButton.nextSibling);
				}
			}
		};
		var game  = this;
		this.history = {
			undoButton: $('undobutton'),
			redoButton: $('redobutton'),
			log: false,
			previous: function() {
				var arrangement = false;
				if (this.log && this.log.previous) {
					this.log = this.log.previous;
					arrangement = this.log.arrangement;
				}
				this.refreshButtons();
				return arrangement;
			},
			next: function() {
				var arrangement = false;
				if (this.log && this.log.next) {
					this.log = this.log.next;
					arrangement = this.log.arrangement;
				}
				this.refreshButtons();
				return arrangement;
			},
			add: function(arrangement) {
				if (!this.log || arrangement.toString() != this.log.arrangement.toString())
				this.log = new HistoryLog(arrangement, this.log);
				this.refreshButtons();
			},
			reset: function() {
				this.log = false;
				this.refreshButtons();
			},
			init: function() {
				if (!this.undoButton || !this.redoButton) return;
				this.undoButton.onclick = function() {
					var previous = game.history.previous()
					if(previous) {
						game.setArrangement(previous);
					}
					return false;
				};
				this.redoButton.onclick = function() {
					var next = game.history.next()
					if(next) {
						game.setArrangement(next);
					}
					return false;
				};
				this.undoButton.ondblclick = this.undoButton.onmousemove = this.redoButton.ondblclick = this.redoButton.onmousemove = function() {
					return false;
				}
			},
			refreshButtons: function() {
				if (!this.undoButton || !this.redoButton) return;
				this.undoButton.className = this.log && this.log.previous ? 'enabled' : 'disabled';
				this.redoButton.className = this.log && this.log.next ? 'enabled' : 'disabled';
			}
		};
		this.history.init();
		this.loadWord();
	},
	reset: function() {
		this.wordDiv.innerHTML = '';
		this.wordDiv.style.display = 'none';//MSIE
		this.wordDiv.className = '';
	},
	setWord: function(word) {
		this.reset();
		this.wordDiv.style.display = '';//MSIE
		this.puzzle = word.puzzle;
		this.correct = word.correct;
		if (this.hintDiv) {
			if (!this.hintEnabled) this.hintDiv.className = 'hidden';
			else this.hintDiv.className = word.hint == '' ? '' : 'hintavailable';
		}
		if (this.hintText && this.hintEnabled) {
			this.hintText.innerHTML = word.hint == '' ? DHTML.getText('nohint', 'No Hint!') : word.hint;
		}
		this.arrangement = false;
		this.length = this.puzzle.length;
		this.positions = Array();
		this.letters = Array();
		var left = (-0.5) * (this.length * this.LETTER_WIDTH + (this.length - 1) * this.LETTER_SPACING);
		for (var i = 0; i < this.length; i++) {
			var position = new Position(this, left, this.correct.charAt(i), i);
			this.positions.push(position);
			this.letters.push(new Letter(this, this.puzzle.charAt(i), position));
			left += this.LETTER_WIDTH + this.LETTER_SPACING;
		}
		this.timer.start();
		this.reArrange();
		this.enableButtons(true);
		this.history.reset();
		this.history.add(this.getPresentArrangement());
		this.loadWord(true); //cache next word
	},
	slide: function(index, start, finish) {
		if (start == finish) {
			this.letters[index].place(finish);
			return;
		}
		var steps = this.ANIMATOR_TIME / this.ANIMATOR_CLOCK;
		var a = 4 * (finish - start) / (steps * steps); //s = 1/2 at^2, applying it on half journey
		var t = 0;
		while (true) {
			var s = 0.5 * a * t * t; // s = 1/2 at^2
			if (this.ANIMATOR_CLOCK * t * 2 > this.ANIMATOR_TIME) break;
			this.letters[index].setTimeout('Game.letters['+index+'].place('+(start+s)+')', this.ANIMATOR_CLOCK * t);
			this.letters[index].setTimeout('Game.letters['+index+'].place('+(finish-s)+')', this.ANIMATOR_TIME - this.ANIMATOR_CLOCK * t);
			t++;
		}
	},
	reArrange: function() {
	
		if (this.stickedLetter) {
			
			if (this.stickedLetter.left - this.LETTER_WIDTH/2 < this.positions[0].left - this.LETTER_OVERDRAG) {
				this.insertLetter(this.stickedLetter, this.positions[0]);
			}
			else if (this.stickedLetter.left - this.LETTER_WIDTH/2 - this.LETTER_SPACING > this.positions[this.length - 1].left + this.LETTER_OVERDRAG) {
				this.insertLetter(this.stickedLetter, this.positions[this.length - 1]);
			}
			else for (var i = 1; i < this.length; i++) {
				if (this.stickedLetter.left - this.LETTER_WIDTH/2 > this.positions[i-1].left + this.LETTER_OVERDRAG && this.stickedLetter.left - this.LETTER_WIDTH/2 - this.LETTER_SPACING < this.positions[i].left - this.LETTER_OVERDRAG) {
					this.insertLetter(this.stickedLetter, this.positions[i]);
					break;
				}
			}
			this.stickedLetter.keepOnTop();
		}
		
		var currectArrangement = this.getPresentArrangement();
		if (this.stickedLetter && currectArrangement.toString() == this.arrangement.toString()) return;
		for (var i = 0; i < this.length; i++) {
			if (this.letters[i] !== this.stickedLetter) {
				this.letters[i].clearTimeout();
				this.slide(i, this.letters[i].left, this.letters[i].position.left);
			}
		}
		this.arrangement = currectArrangement;
	},
	getPresentArrangement: function() {
		var positionNumbers = Array();
		var solvedNumbers = Array();
		for (var i in this.letters) {
			positionNumbers[i] = this.letters[i].position.number;
			solvedNumbers[i] = this.letters[i].position.solved;
		}
		return new Arrangement(positionNumbers, solvedNumbers);
	},
	setArrangement: function(arrangement) {
		for (var i in this.letters) {
			this.letters[i].swapPosition(this.positions[arrangement.positionNumbers[i]].letter);
		}
		this.reArrange();
	},
	insertLetter: function(letter, position) {
		var direction = letter.position.number < position.number ? 1 : -1; //1 = move right, -1 = move left
		for (var j = letter.position.number+direction; direction * j <= direction * position.number; j += direction) {
			letter.swapPosition(this.positions[j].letter);
		}
	},
	solve: function() {
		for (var i in this.positions) {
			this.positions[i].solve();
		}
	},
	getMouseX: function(e) {
		e = e || window.event;
		var x = 0;
		if(e.pageX||e.pageY) {
			x = e.pageX;
		}
		else if(e.clientX||e.clientY) {
			x = e.clientX + document.body.scrollLeft+document.documentElement.scrollLeft;
		}
		return x;
	},
	onMouseMove: function(e) {
		if (!this.stickedLetter) return;
		var x = this.getMouseX(e);
		this.stickedLetter.place(x + this.stickedLetter.offset);
		this.reArrange();
	},
	onMouseUp: function() {
		if (!this.stickedLetter) return;
		this.stickedLetter.release();
		this.history.add(this.getPresentArrangement());
	},
	submit: function() {
		var correct = true;
		for (var i in this.positions) {
			if (this.positions[i].letter.character != this.positions[i].correct) {
				correct = false;
				break;
			}			
		}
		if (correct) {
			this.wordDiv.className = 'correct';
			this.enableButtons(false);
			this.timer.stop();
			this.timeouts.push(window.setTimeout('Game.reset();Game.nextWord();', this.SKIP_SHOW_TIME/2 - 100));
			this.timeouts.push(window.setTimeout('Game.doneWords.add(\''+this.correct+'\', true)', this.SKIP_SHOW_TIME/2));
		}
		else {
			this.wordDiv.className = 'incorrect';
			this.timeouts.push(window.setTimeout('Game.wordDiv.className = \'\';', this.FLASHER_TIME / 3));
			this.timeouts.push(window.setTimeout('Game.wordDiv.className = \'incorrect\';', 2 * this.FLASHER_TIME/ 3));
			this.timeouts.push(window.setTimeout('Game.wordDiv.className = \'\';', this.FLASHER_TIME));
		}
	},
	skip: function() {
		this.solve();
		this.timer.stop();
		this.enableButtons(false);
		this.timeouts.push(window.setTimeout('Game.reset();Game.nextWord();Game.doneWords.add(\''+this.correct+'\', false);', this.SKIP_SHOW_TIME));
	},
	enableButtons: function(flag) {
		if (flag) {
			var game = this;
			this.skipButton.onclick = function() {
				game.skip();
			};
			this.submitButton.onclick = function() {
				game.submit();
			};
			this.skipButton.className = this.submitButton.className = '';
		}
		else {
			this.skipButton.className = this.submitButton.className = 'disabled';
			this.skipButton.onclick = this.submitButton.onclick = function() {
				return false;
			}
		}
	},
	loadWord: function(cache, set, difficulty) {
		if (this.ajax) this.ajax.destroy();
		if (!cache) for (var i in this.timeouts) window.clearTimeout(this.timeouts[i]);
		if (set != undefined) this.set = set;
		if (difficulty != undefined) this.difficulty = difficulty;
		var self = this;
		this.ajax = new Ajax();
		this.ajax.url = this.SERVER_URL + '&set=' + this.set + '&difficulty=' + this.difficulty + '&rand=' + Math.random();
		this.ajax.cacheResponse = !!cache;
		this.ajax.respond = function(xml) {
			xml = xml.getElementsByTagName('response')[0];
			var success = xml.getAttribute('success') == "1";
			if (success) {
				var game = xml.getElementsByTagName('game')[0];
				if (!game) {
					DHTML.setStatus(DHTML.getText('unsuccess', 'Action Unsuccesful!'));
					return;
				}
				var word = new Word(game.getAttribute('scrambled'), game.getAttribute('word'), game.getAttribute('hint'));
				if (this.cacheResponse) self.cacheWord = word;
				else self.setWord(word);
				return;
			}
			var error = xml.getElementsByTagName('error')[0];
			DHTML.setStatus(error.getAttribute('text'));
			self.enableButtons(false);
			self.timer.expire();
		};
		this.ajax.get();
	},
	nextWord: function() {
		if (this.cacheWord) { 
			this.setWord(this.cacheWord);
			this.cacheWord = false;
		}
		else {
			this.loadWord();
		}
	},
	debug: function() {
		if (!this.debugDiv) {
			this.debugDiv = document.createElement('div');
			document.body.appendChild(this.debugDiv);
			this.debugDiv.style.position = 'absolute';
			this.debugDiv.style.left = this.debugDiv.style.top = '0';
		}
		var s = "";
		for (var i in this.positions)
		s += this.positions[i].number + '|' + this.positions[i].letter.character + '|' + this.positions[i].left + '|' + this.positions[i].letter.left + '<br>';
		this.debugDiv.innerHTML = s;
	}
}
function Word(puzzle, correct, hint, image, sound) {
	this.puzzle = puzzle;
	this.correct = correct;
	this.hint = hint;
	this.image = image;
	this.sound = sound;
}
function Position(game, left, correct, number) {
	this.game = game;
	this.left = left;
	this.correct = correct;
	this.number = number;
	this.solved = false;
	this.letter = false;
	this.assignLetter = function(letter) {
		this.letter = letter;
	};
	this.solve = function() {
		if (this.solved) return;
		if (!this.letter) {
			throw ('Can not solve for any position unless assigned a letter.');
		}
		if (this.correct != this.letter.character) {
			for (var i in this.game.positions) {
				if (!this.game.positions[i].solved && this.game.positions[i].letter.character == this.correct) {
					this.letter.swapPosition(this.game.positions[i].letter);
					this.game.reArrange();
					break;
				}
			}
		}
		this.solved = true;
		this.letter.markSolved();
		this.game.history.reset();
	};
}
function Letter(game, character, position) {
	this.game = game;
	this.character = character;
	this.position = position;
	this.position.assignLetter(this);
	this.offset = 0;
	this.left = 0;
	this.slideTimers = false;//array (cum flag) to save reference of timers used for sliding
	this.div = document.createElement('div');
	this.div.innerHTML = this.character;
	this.game.wordDiv.appendChild(this.div);
	this.place = function(left) {
		if (left == undefined) left = this.position.left;
		this.left = left;
		this.div.style.marginLeft = left + 'px';
	};
	this.stick = function(e) {
		if (this.position.solved) return;
		this.offset = this.position.left - this.game.getMouseX(e);
		this.game.stickedLetter = this;
		this.div.className = 'sticky';
	};
	this.release = function() {
		this.div.className = '';
		this.offset = 0;
		this.game.stickedLetter = false;	
		this.game.reArrange();
	};
	this.swapPosition = function(letter) {
		if (this.position.solved || letter.position.solved || this === letter) return;	
		var newPosition = letter.position;
		this.position.assignLetter(letter);
		letter.position = this.position;		
		newPosition.assignLetter(this);
		this.position = newPosition;
	};
	this.setTimeout = function(f, t) {
		if (this.slideTimers === false) {
			this.slideTimers = Array();
		}
		this.slideTimers.push(window.setTimeout(f, t));
	};
	this.clearTimeout = function() {
		if (this.slideTimers)
		for (var i in this.slideTimers) {
			window.clearTimeout(this.slideTimers[i]);
		}
		this.slideTimers = false;
	};
	this.keepOnTop = function() {
		this.div.parentNode.appendChild(this.div);
	};
	this.markSolved = function() {
		this.div.className = 'solved';
	};
	var letter = this;
	this.div.onmousedown = function(e) {
		letter.stick(e);
		return false;
	};
	this.div.ondblclick = function() {
		letter.position.solve();
		return false;
	}
}
function HistoryLog(arrangement, previous) {
	this.arrangement = arrangement;
	this.previous = previous;
	if (this.previous) this.previous.next = this;
	this.next = false;
}
function Arrangement(positionNumbers, solvedNumbers) {
	this.positionNumbers = positionNumbers;
	this.solvedNumbers = solvedNumbers;
	this.toString = function() {
		var string = "";
		for (var i in this.positionNumbers) {
			string += this.positionNumbers[i] + (this.solvedNumbers[i] ? "1" : "0") + "|";
		}
		return string;
	}
} 
function Ajax() {
	this.http = false;
	this.cacheResponse = false;
	try	{
		this.http = new XMLHttpRequest();
	}
	catch (e) {
		try {
			this.http = new ActiveXObject("Msxml2.XMLHTTP");
		}
		catch (e1) {
			this.http = new ActiveXObject("Microsoft.XMLHTTP");
		}
	}
	if (!this.http) {
		DHTML.setStatus(DHTML.getText('noajax', 'Your browser doesn\'t support AJAX.'));
		return;
	}
	this.post = function(params) {
		if (!this.url) {
			DHTML.alert('URL not given for AJAX request');
			return false;
		}
		try {
			var self = this;
			this.http.onreadystatechange = function () {
				if (this.readyState==4 || this.readyState=="complete") {
					DHTML.loading(false);
					if (this.status == 200) {
						var res = this.responseXML;
						if (!res) {
							DHTML.alert('Server Error: \n' + this.responseText.replace(/<[^>]*>/g, ''));
							return;
						}
						self.respond(res);
					}
					else DHTML.setStatus(DHTML.getText('unsuccess','Action Unsuccesful!'));
				}
				else {
					DHTML.loading(!self.cacheResponse);
				}
			}
			var requestType = !params ? 'get' : 'post';
			var random = '&random=' + Math.random();
			this.http.open(requestType, this.url + random, true);
			if (requestType == 'post') {
				this.http.setRequestHeader("Content-type", "application/x-www-form-urlencoded; charset=utf-8");
				this.http.setRequestHeader("Content-length", params.length);
			}
			this.http.setRequestHeader("Connection", "close");
			this.http.send(params || '');
			return true;
		}
		catch (e) {
			DHTML.alert('JavaScript Error: ' + e);
			return false
		}
	};
	this.get = function() {
		return this.post();
	};
	this.destroy = function() {
		this.http.abort();
	};
}
function $(id) {
	if (document.getElementById(id))
	return document.getElementById(id);
	return false;
}