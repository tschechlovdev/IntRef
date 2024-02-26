import {BackendCommunicator} from "./BackendCommunicator";
import {ClusterComponent} from "./ClusterComponent";
import { loadGraph, reformatAttributes, } from "./utils";
import { Tree } from "./clusterTree/tree";


export class FrontendHandler {

    cc: ClusterComponent[] = [];

    // General parameters
    clusteringAlgorithm: string;
    filepath: string;
    separator: string;
    clusterTree: Tree;

    // Method 3 specific variables
    oldSelected: string = ""; //Last clicked attribute of method 3, which will be deleted from selected Attributes
    attributes: [];
    selectedAttributes: string[] = [];
    attCount = 0;

    constructor() {
        // Initialize all three cluster components, but in the beginning only one will be shown
        this.constructFrontpage();

        this.clusteringAlgorithm = "pckmeans";
        this.filepath = "Datasets/students_performance/student-mat_numerical.csv";
        this.separator = ",";

        //console.log("nothing to do (FrontendHandler)");
    }

    init(): Promise<boolean> {
        let self = this;
        self.filepath = self.filepath = document.forms["inputForm"].elements["datasetDropdown"].value;
        let promise: Promise<boolean> = new Promise<boolean>(function (resolve) {

            //init tree
            self.clusterTree = new Tree()
            BackendCommunicator.getInstance().setTree(self.clusterTree)



            // Start Button Event
            document.getElementById("startBtn").addEventListener('click', function (event) {
                // Get method to be displayed
                let methodValue = document.forms["inputForm"].elements["methodsRadios"].value;
                if (methodValue === "method3" && self.selectedAttributes.length != 0) {
                    methodValue = "modified_method3"
                }

                // Get amount of components to be displayed
                // let nrComponents = document.forms["inputForm"].elements["viewDropdown"].value;
                // if (nrComponents == 1) {
                //     self.hideComponents(true)
                // } else {
                //     self.hideComponents(false)
                // }
                // BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/attributes", JSON.stringify({
                //     "reason": "graph",
                //     "dataset": self.filepath,
                //     "separator": self.separator,
                // }));
                //clusterTree init datasource and algorithm
                BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/config_datasc_algo", JSON.stringify({
                    "instance_id": BackendCommunicator.getInstance().instance_id, 
                    "data_source": self.filepath,
                    "separator": self.separator,
                    "algorithm": self.clusteringAlgorithm,
                }));
                self.executeMethod(methodValue);

                //document.getElementById("componentContainer").hidden = false;
            });

            // Event Handling for the different components
            document.getElementById("componentContainer").addEventListener('change', function (event) {
                //TODO
                let target = (<Element>event.target).id.split("_")[0];
                switch (target) {
                    case "graphAttDropdown":
                        loadGraph((<Element>event.target).parentNode.parentNode.parentNode.parentElement.id.split('_')[1]);
                        break;
                    case "clusterDropdown":
                        loadGraph((<Element>event.target).parentNode.parentNode.parentNode.parentElement.id.split('_')[1]);
                        break;
                    case "parallelCoordinatesRadio":
                    case "histogramDebugRadio" :
                    case "histogramDoubleRadio" :
                    case "histogramSingleRadio":
                        //console.warn("hello2222222222222222222")
                        $(".histogramDivClass").css("width", "400px");
                        let id = (<Element>event.target).parentNode.parentNode.parentNode.parentElement.id.split('_')[1];
                        self.reset_border_color(id);
                        let value = document.forms["GraphForm_" + id].elements["diagramRadios_" + id].value;
                        document.getElementById('GraphInput_' + id).hidden = value === 'coordinates';
                        loadGraph(id);
                        break;
                }

            });

            document.getElementById("saveOption").addEventListener("click", function (event) {
                BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/get_clust_result",JSON.stringify({
                    "instance_id": BackendCommunicator.getInstance().instance_id, 
                }));
            })


            document.getElementById("componentContainer").addEventListener('click', function (event) {
                let target = (<Element>event.target);
                // Add Axis back to the Parallel Coordinates Graph
                if (target.localName === 'li') {
                    let id = (<Element>event.target).parentNode.parentNode.parentNode.parentElement.id.split('_')[1]; //TODO has to be a nicer way
                    if (self.cc[id].graph != null) {
                        let axis = target.textContent;
                        self.cc[id].graph.addAxis(axis);
                        //Remove the clicked element
                        target.parentNode.removeChild(target);
                    }
                } else if (target.id.split("_")[0] == 'splitButton') {
                    let id = (<Element>event.target).id.split('_')[1];
                    let leftValue;
                    let rightValue;
                    if (id == '1') {
                        leftValue = document.forms["InputForm"].elements['param1input1'].value;
                        rightValue = document.forms["InputForm"].elements['param1input0'].value;
                        document.forms["InputForm"].elements['param1input2'].value = rightValue;
                    } else if (id == '2') {
                        leftValue = document.forms["InputForm"].elements['param1input0'].value;
                        rightValue = document.forms["InputForm"].elements['param1input2'].value;
                        document.forms["InputForm"].elements['param1input1'].value = leftValue;
                    }
                    document.forms["InputForm"].elements['param1input0'].value = Math.floor((+leftValue + +rightValue) / 2);
                    let methodValue = document.forms["inputForm"].elements["methodsRadios"].value;
                    self.executeMethod(methodValue);

                }

            });

            // Data set selection
            document.getElementById("datasetDropdown").addEventListener('change', function (event) {
                self.filepath = document.forms["inputForm"].elements["datasetDropdown"].value;

                // Reset Attribute selection
                self.selectedAttributes = [];
                document.getElementById("attributeDropdownDiv").querySelectorAll("[id^='attributeFormDiv_']").forEach(n => n.remove());
                BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/attributes", JSON.stringify({
                    "reason": "method3",
                    "dataset": self.filepath,
                    "separator": self.separator,
                }));
            });

            // Cluster selection
            document.getElementById("algoDropdown").addEventListener('change', function (event) {
                self.clusteringAlgorithm = document.forms["inputForm"].elements["algoDropdown"].value;
                let componentsValue = document.forms["inputForm"].elements["viewDropdown"].value;
                document.getElementById("param2InputDiv0").hidden = self.clusteringAlgorithm != "dbscan";
                document.getElementById("param2InputDiv1").hidden = self.clusteringAlgorithm != "dbscan" || componentsValue != 3;
                document.getElementById("param2InputDiv2").hidden = self.clusteringAlgorithm != "dbscan" || componentsValue != 3;
                for (let id = 0; id < componentsValue; id++) {
                    if (self.clusteringAlgorithm == "pckmeans") {
                        document.getElementById("param1label" + id).innerText = "k";
                        document.forms["InputForm"].elements["param1input" + id].value = "2";
                        document.forms["InputForm"].elements["param1input" + id].step = "1";
                    } else if (self.clusteringAlgorithm == "dbscan" || self.clusteringAlgorithm == "optics") {
                        document.getElementById("param1label" + id).innerText = "Min Samples";
                        document.forms["InputForm"].elements["param1input" + id].value = "5";
                        document.forms["InputForm"].elements["param1input" + id].step = "0.1";
                    }
                }

            });

            // Change of amounts of views
            document.getElementById("viewDropdown").addEventListener('change', function (event) {
                let componentsValue = document.forms["inputForm"].elements["viewDropdown"].value;
                document.getElementById("param1InputDiv1").hidden = componentsValue != 3;
                document.getElementById("param1InputDiv2").hidden = componentsValue != 3;
                document.getElementById("param2InputDiv1").hidden = self.clusteringAlgorithm != "dbscan" || componentsValue != 3;
                document.getElementById("param2InputDiv2").hidden = self.clusteringAlgorithm != "dbscan" || componentsValue != 3;

                if (componentsValue != 3) {
                    document.getElementById("clusterInfoDiv_0").classList.remove("col-md-4")
                } else {
                    document.getElementById("clusterInfoDiv_0").classList.add("col-md-4")
                }

                if (self.clusteringAlgorithm == "dbscan" || self.clusteringAlgorithm == "optics") {
                    document.getElementById("param1label" + 1).innerText = "Min Samples";
                    document.forms["InputForm"].elements["param1input" + 1].value = "5";
                    document.forms["InputForm"].elements["param1input" + 1].step = "0.1";
                    document.getElementById("param1label" + 2).innerText = "Min Samples";
                    document.forms["InputForm"].elements["param1input" + 2].value = "5";
                    document.forms["InputForm"].elements["param1input" + 2].step = "0.1";
                }
            });

            // If method3 is selected, show the attribute selection
            document.getElementById("methodsForm").addEventListener('change', function (event) {
                let methodValue = document.forms["inputForm"].elements["methodsRadios"].value;
                // Request attributes for the method, then show them
                if (methodValue === "method3") {
                    if (document.getElementById("attributeDropdownDiv").children.length == 1) {
                        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/attributes", JSON.stringify({
                            "reason": "method3",
                            "dataset": self.filepath,
                            "separator": self.separator,
                        }));
                    }
                    document.getElementById("attributeFormDiv").hidden = false;
                } else {
                    document.getElementById("attributeFormDiv").hidden = true;

                }
            });

            // Adds an attribute selection for method 3
            document.getElementById("attributeBtn").addEventListener('click', function (event) {
                self.loadAttributesTemplate();
            });

            // Capture click events that affect additional attributes for method 3
            // The checked events are deleting an attribute or saving the old value of an attribute if its selector is clicked
            document.getElementById("attributeDropdownDiv").addEventListener('click', function (event) {
                let target = (<Element>event.target).id.split("_");
                let name = target[0];
                let id = target[1];

                if (name === "delAttribute") {
                    let value = document.forms["inputForm"].elements["attributeDropdown_" + id].value;
                    if (value !== "") {
                        let index = self.selectedAttributes.findIndex(x => x === self.oldSelected);
                        self.selectedAttributes.splice(index, 1);
                    }
                    document.getElementById("attributeDropdownDiv").removeChild(document.getElementById("attributeFormDiv_" + id));
                } else if (name === "attributeDropdown") {
                    self.oldSelected = document.forms["inputForm"].elements["attributeDropdown_" + id].value;
                }

            });

            // Capture change events that affect additional attributes for method 3
            // The checked event is a change to one of the selectors
            document.getElementById("attributeDropdownDiv").addEventListener('change', function (event) {
                let target = (<Element>event.target).id.split("_");
                let name = target[0];
                let id = target[1];

                if (name === "attributeDropdown") {
                    let value = document.forms["inputForm"].elements["attributeDropdown_" + id].value;
                    if (value !== "") {
                        self.selectedAttributes.push(value);
                    }
                    if (self.oldSelected !== "") {
                        let index = self.selectedAttributes.findIndex(x => x === self.oldSelected);
                        self.selectedAttributes.splice(index, 1);
                    }
                }

            });

            // load template when opening the site for the first time
            self.loadTemplate().then(function (template) {
                document.getElementById("clusterInfoDiv_0").innerHTML = template;
                resolve(true)
            });


        });
        return promise;
    }

    /**
     * Sends information about the selected method to the backend where it is then executed
     * @param method the currently selected method
     */
    executeMethod(method: string): void {
        //TODO check if correct
        let noComponents = document.forms["inputForm"].elements["viewDropdown"].value;

        // For each component send a message
        for (let i = 0; i < noComponents; i++) {
            document.getElementById("header_" + i).innerText =
                document.getElementById("param1label" + i).innerText + " = "
                + document.forms["InputForm"].elements["param1input" + i].value;
            let id = this.cc[i].id;
            let parameters = [];
            parameters.push(+document.forms["InputForm"].elements["param1input" + i].value);
            if (this.clusteringAlgorithm == "dbscan") {
                parameters.push(+document.forms["InputForm"].elements["param2input" + i].value);
                document.getElementById("header_" + i).innerText += "\n" +
                    document.getElementById("param2label" + i).innerText + " = "
                    + document.forms["InputForm"].elements["param2input" + i].value;
            }
            let msg;

            if (method !== "modified_method3") {
                msg = JSON.stringify({
                    "id": id,
                    "dataset": this.filepath,
                    "separator": this.separator,
                    "algorithm": this.clusteringAlgorithm,
                    "param": parameters,
                });
            } else {
                // Use set so no duplicates are added to the result
                let atts = [...new Set(this.selectedAttributes)];
                msg = JSON.stringify({
                    "id": id,
                    "dataset": this.filepath,
                    "separator": this.separator,
                    "algorithm": this.clusteringAlgorithm,
                    "param": parameters,
                    "addAttr": atts,
                });
            }

            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/" + method, msg);

            this.cc[id].reloadClusterTemplate().then(function (template) {
                document.getElementById("clusterInfoDiv_" + id).innerHTML = template;
            });
        }

    }

    /**
     * Loads the template when initially starting the site for displaying the cluster information
     */
    //TODO Does this even work?
    //No it does not :)
    loadTemplate(): Promise<string> {
        let fh: FrontendHandler = this;
        let template = require('./templates/clusterComponent.hbs');
        let rendered = template({
            cluster1Content: fh.cc[0].content
        });

        return Promise.resolve(rendered)
    }

    //TODO ?
    loadAttributesTemplate() {
        let fh: FrontendHandler = this;
        let template = require('./templates/attributeSelect.hbs');
        let attributes = reformatAttributes(this.attributes);
        let rendered = template({
            id: fh.attCount,
            attribute: attributes
        });
        fh.attCount += 1;
        //document.getElementById("attributeDropdownDiv").innerHTML += rendered;
        // Not optimal, but above command will reload html with each new template
        document.getElementById("fillerDiv").insertAdjacentHTML('afterend', rendered);
    }

    loadAttributeSelectionGraph(attributes: any[]) {
        // for (let id = 0; id < this.cc.length; id++) {
        //     let attSelect = document.getElementById("graphAttDropdown_" + id);
        //     document.forms["GraphForm_" + id].elements["graphAttDropdown_" + id].options.length = 0;
        //     for (let a of reformatAttributes(attributes)) {
        //         attSelect.append(new Option(a['name'], a['value']));
        //     }
        // }
    }

    constructFrontpage() {
        for (let i = 0; i < 1; i++) {
            this.cc.push(new ClusterComponent("IM EMPTY!", "", i));
            this.cc[i].init();
        }
    }

    hideComponents(b: boolean) {
        document.getElementById("graphDiv_1").hidden = b;
        document.getElementById("clusterInfoDiv_1").hidden = b;
        document.getElementById("graphDiv_2").hidden = b;
        document.getElementById("clusterInfoDiv_2").hidden = b;

    }

    /**
     * As for parallel coordinates plot the border color of the cluster visualization is changed revert it back to the original
     */
    reset_border_color(id) {
        // let nrComponents = document.forms["inputForm"].elements["viewDropdown"].value;
        // // Each cluster of the cluster component has its border reset
        // for (let j = 0; j < this.cc[id].content[1].length; j++) {
        //     //console.log("clu_cont_"+ id + "" + j);
        //     document.getElementById("clu_cont_"+ id + "" + j).style.border = "0px"
        // }

    }
}
