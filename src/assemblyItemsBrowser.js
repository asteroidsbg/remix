var React = require('react');
var BasicPanel = require('./basicPanel')
var Sticker = require('./sticker')
var codeUtils = require('./codeUtils')
var style = require('./basicStyles')

module.exports = React.createClass({

	getInitialState: function()
	{
		return {
			currentSelected: 0, // current selected item in the vmTrace
			selectedInst: 0, // current selected item in the contract assembly code
			currentAddress: null,
			currentStack: null,
			currentLevels: null,
			currentStorage: null,
			currentMemory: null,
			currentCallData: null,
			currentStepInfo: null,
			instructionsIndexByBytesOffset: {}, // mapping between bytes offset and instructions index.
			callStack: {},
			currentCode: null
		};
	},

	getDefaultProps: function() 
	{
		return {
			vmTrace: null
		};
	},	

	render: function() 
	{		
		return (
			<div style={this.props.vmTrace === null ? style.hidden : style.display} >
			<div style={style.container}><span style={style.address}>Current code: {this.state.currentAddress}</span></div> 
			
			<div style={style.container}>
				<button onClick={this.stepIntoBack} disabled={ this.checkButtonState(-1) } >Step Into Back</button>
				<button onClick={this.stepOverBack} disabled={ this.checkButtonState(-1) } >Step Over Back</button>
				<button onClick={this.stepOverForward} disabled={ this.checkButtonState(1) } >Step Over Forward</button>
				<button onClick={this.stepIntoForward} disabled={ this.checkButtonState(1) } >Step Into Forward</button>
				<button onClick={this.jumpNextContext} >Jump Next Context</button>
			</div>

			<div style={style.container}>
			<table>
				<tbody>
				<tr>
					<td>
						<select size="10" ref='itemsList' style={style.instructionsList}  value={this.state.selectedInst}>
						{ this.renderAssemblyItems() }
						</select>
						<div style={Object.assign(style.inline, style.sticker)}>
							<Sticker data={this.state.currentStepInfo} />
						</div>
					</td>
					<td>
						<BasicPanel name="CallData" data={this.state.currentCallData} />
					</td>
				</tr>
				<tr>
					<td>
						<BasicPanel name="Stack" data={this.state.currentStack} />
					</td>
					<td>
						<BasicPanel name="CallStack" data={this.state.currentCallStack} />	
					</td>					
				</tr>
				<tr>
					<td>
						<BasicPanel name="Storage" data={this.state.currentStorage} renderRow={this.renderStorageRow} />
					</td>
					<td>
						<BasicPanel name="Memory" data={this.state.currentMemory} renderRow={this.renderMemoryRow} />
					</td>
				</tr>
				</tbody>
			</table>
			</div>	
			</div>		
			);
	},

	renderStorageRow: function(data)
	{
		var ret = []
		if (data)
		{
			for (var key in data)
				ret.push(<tr key={key} ><td>{key}</td><td>{data[key]}</td></tr>)
		}
		return ret
	},

	renderMemoryRow: function(data)
	{
		var ret = []
		if (data)
		{
			for (var key in data)
			{
				var memSlot = data[key]
				ret.push(<tr key={key} ><td>{memSlot.address}</td><td>{memSlot.content.raw}</td><td>{memSlot.content.ascii}</td></tr>)
			}
		}
		return ret
	},

	resolveCode: function(code)
	{
		return codeUtils.nameOpCodes(new Buffer(code.substring(2), 'hex'))
	},
	
	jumpNextContext: function()
	{
		var i = this.state.currentSelected
		while (++i < this.props.vmTrace.length)
		{
			if (this.isCallInstruction(i))
				break
		}
		this.selectState(i);
	},

	checkButtonState: function(incr)
	{
		if (!this.props.vmTrace)
			return "disabled"
		if (incr === -1)
			return this.state.currentSelected === 0 ? "disabled" : ""
		else if (incr === 1)
			return this.state.currentSelected >= this.props.vmTrace.length - 1 ? "disabled" : "" 
	},

	renderAssemblyItems: function()
	{
		if (this.props.vmTrace)
		{
			return this.state.currentCode.map(function(item, i)
			{
				return <option key={i} value={i} >{item}</option>;
			});	
		}
	},

	componentWillReceiveProps: function (nextProps) 
	{
		if (!nextProps.vmTrace)
			return
		this.buildCallStack(nextProps.vmTrace)
		this.updateState(nextProps, 0)
	},

	buildCallStack: function(vmTrace)
	{
		if (!vmTrace)
			return
		var callStack = []
		var depth = -1
		for (var k = 0; k < vmTrace.length; k++)
		{
			var trace = vmTrace[k]
			if (trace.depth === undefined || trace.depth === depth)
				continue
			if (trace.depth > depth)
				callStack.push(trace.address) // new context
			else if (trace.depth < depth)
				callStack.pop() // returning from context
			depth = trace.depth
			this.state.callStack[k] = callStack.slice(0)
		}
	},

	updateState: function(props, vmTraceIndex)
	{
		if (!props.vmTrace)
			return
		var previousState = this.state.currentSelected
		var stateChanges = {}

		var currentAddress = this.state.currentAddress
		if (!currentAddress)
			currentAddress = props.vmTrace[vmTraceIndex].address
		if (props.vmTrace[vmTraceIndex].address && props.vmTrace[vmTraceIndex].address !== this.state.currentAddress)
			stateChanges["currentAddress"] = props.vmTrace[vmTraceIndex].address
		
		var	instructionsIndexByBytesOffset = this.state.currentInstructionsIndexByBytesOffset
		var codeIndex = vmTraceIndex
		if (vmTraceIndex < previousState)
			codeIndex = this.retrieveLastSeenProperty(vmTraceIndex, "depth", props.vmTrace)
		if (props.vmTrace[codeIndex].code && props.vmTrace[codeIndex].code !== this.state.currentCode)
		{
			var code = this.resolveCode(props.vmTrace[codeIndex].code)
			stateChanges["currentCode"] = code[0]
			stateChanges["currentInstructionsIndexByBytesOffset"] = code[1]
			instructionsIndexByBytesOffset = code[1]
		}

		if (props.vmTrace[vmTraceIndex].stack)
		{
			var stack = props.vmTrace[vmTraceIndex].stack
			stack.reverse()
			stateChanges["currentStack"] = stack
		}

		var callStackIndex = vmTraceIndex
		if (vmTraceIndex < previousState)
			callStackIndex = this.retrieveLastSeenProperty(vmTraceIndex, "depth", props.vmTrace)
		if (this.state.callStack[callStackIndex] || callStackIndex === 0)
			stateChanges["currentCallStack"] = this.state.callStack[callStackIndex]

		var storageIndex = vmTraceIndex
		if (vmTraceIndex < previousState)
			storageIndex = this.retrieveLastSeenProperty(vmTraceIndex, "storage", props.vmTrace)
		if (props.vmTrace[storageIndex].storage || storageIndex === 0)
			stateChanges["currentStorage"] = props.vmTrace[storageIndex].storage

		var memoryIndex = vmTraceIndex
		if (vmTraceIndex < previousState)
			memoryIndex = this.retrieveLastSeenProperty(vmTraceIndex, "memory", props.vmTrace)	
		if (props.vmTrace[memoryIndex].memory || memoryIndex === 0)
			stateChanges["currentMemory"] = this.formatMemory(props.vmTrace[memoryIndex].memory, 16)

		var callDataIndex = vmTraceIndex
		if (vmTraceIndex < previousState)
			callDataIndex = this.retrieveLastSeenProperty(vmTraceIndex, "calldata", props.vmTrace)
		if (props.vmTrace[vmTraceIndex].calldata || callDataIndex === 0)
			stateChanges["currentCallData"] = [props.vmTrace[callDataIndex].calldata]

		stateChanges["selectedInst"] = instructionsIndexByBytesOffset[props.vmTrace[vmTraceIndex].pc]
		stateChanges["currentSelected"] = vmTraceIndex

		stateChanges["currentStepInfo"] = [
			"Current Step: " + props.vmTrace[vmTraceIndex].steps,
			"Adding Memory: " + (props.vmTrace[vmTraceIndex].memexpand ? props.vmTrace[vmTraceIndex].memexpand : ""),
			"Step Cost: " + props.vmTrace[vmTraceIndex].gascost,
			"Remaining Gas: " + props.vmTrace[vmTraceIndex].gas
		]		
		this.setState(stateChanges)
	},

	retrieveLastSeenProperty: function(currentIndex, propertyName, vmTrace)
	{
		var index = currentIndex
		while (index > 0)
		{
			if (vmTrace[index][propertyName])
				break
			index--
		}
		return index	
	},

	stepIntoBack: function()
	{
		this.moveSelection(-1)
	},

	stepOverBack: function()
	{
		if (this.isReturnInstruction(this.state.currentSelected - 1))
			this.stepOutBack();
		else
			this.moveSelection(-1);
	},

	stepOverForward: function()
	{
		if (this.isCallInstruction(this.state.currentSelected))
			this.stepOutForward();
		else
			this.moveSelection(1);
	},

	stepIntoForward: function()
	{
		this.moveSelection(1)
	},

	isCallInstruction: function(index)
	{
		var state = this.props.vmTrace[index];
		return state.instname === "CALL" || state.instname === "CALLCODE" || state.instname === "CREATE" || state.instname === "DELEGATECALL"
	},

	isReturnInstruction: function(index)
	{
		var state = this.props.vmTrace[index];
		return state.instname === "RETURN"
	},

	stepOutBack: function()
	{
		var i = this.state.currentSelected - 1;
		var depth = 0;
		while (--i >= 0) 
		{
			if (this.isCallInstruction(i))
			{
				if (depth == 0)
					break;
				else
					depth--;
			}
			else if (this.isReturnInstruction(i))
					depth++;
			
		}
		this.selectState(i);
	},

	stepOutForward: function()
	{
		var i = this.state.currentSelected
		var depth = 0
		while (++i < this.props.vmTrace.length) 
		{
			if (this.isReturnInstruction(i))
			{
				if (depth == 0)
					break
				else
					depth--
			}
			else if (this.isCallInstruction(i))
				depth++
		}
		this.selectState(i + 1);
	},

	moveSelection: function(incr)
	{
		this.selectState(this.state.currentSelected + incr)
	},

	selectState: function(index)
	{
		this.updateState(this.props, index)
	},

	formatMemory: function(mem, width)
	{
		var ret = []
		for (var k = 0; k < mem.length; k += (width * 2))
		{
			var memory = mem.substr(k, width * 2)
			ret.push({
				address: web3.toHex(k),
				content: this.tryAsciiFormat(memory)
			})
		}
		return ret
	},

	tryAsciiFormat: function(memorySlot)
	{
		var ret = { ascii: "", raw: "" }
		for (var k = 0; k < memorySlot.length; k += 2)
		{
			var raw = memorySlot.substr(k, 2)
			var ascii = web3.toAscii(raw)
			if (ascii === String.fromCharCode(0))
				ret.ascii += "?"
			else
				ret.ascii += ascii
			ret.raw += " " + raw
		}
		return ret
	}
})
