'use strict';
const AggregateError = require('aggregate-error');
const PCancelable = require('p-cancelable');

module.exports = (iterable, options) => new PCancelable((resolve, reject, onCancel) => {
	options = Object.assign({}, options);

	if (!Number.isFinite(options.count)) {
		throw new TypeError(`Expected a finite number, got ${typeof options.count}`);
	}

	const values = [];
	const errors = [];
	let elCount = 0;
	let maxErrors = -options.count + 1;
	let maxFiltered = -options.count + 1;
	let done = false;

	const completed = new Set();
	const cancelPendingIfDone = () => {
		if (!done) {
			return;
		}

		for (const promise of iterable) {
			if (!completed.has(promise) && typeof promise.cancel === 'function') {
				promise.cancel();
			}
		}
	};

	onCancel(() => {
		done = true;
		cancelPendingIfDone();
	});

	const fulfilled = value => {
		if (done) {
			return;
		}

		if (typeof options.filter === 'function' && !options.filter(value)) {
			if (--maxFiltered === 0) {
				done = true;
				reject(new RangeError(`Not enough values pass the \`filter\` option`));
			}

			return;
		}

		values.push(value);

		if (--options.count === 0) {
			done = true;
			resolve(values);
		}
	};

	const rejected = error => {
		if (done) {
			return;
		}

		errors.push(error);

		if (--maxErrors === 0) {
			done = true;
			reject(new AggregateError(errors));
		}
	};

	for (const el of iterable) {
		maxErrors++;
		maxFiltered++;
		elCount++;

		Promise.resolve(el).then(
			value => {
				fulfilled(value);
				completed.add(el);
				cancelPendingIfDone();
			},
			error => {
				rejected(error);
				completed.add(el);
				cancelPendingIfDone();
			}
		);
	}

	if (options.count > elCount) {
		throw new RangeError(`Expected input to contain at least ${options.count} items, but contains ${elCount} items`);
	}
});

module.exports.AggregateError = AggregateError;
