import {BackendCommunicator} from "./BackendCommunicator";
import {loadClusterSelect} from "./utils";
import {GraphComponent} from "./graphs/GraphComponent";

export class ClusterComponent {
    algorithm: string;
    content: any;
    topic: string;

    template: string;
    id: number;
    graph: GraphComponent = null;

    /**
     * Constructs an object of this class
     * @param content the content shown in this cluster component
     * @param algorithm the algorithm which was used to compute the content
     * @param id the id of this component. Either 0, 1 or 2
     */
    constructor(content: string, algorithm: string, id: number) {
        this.content = content;
        this.algorithm = algorithm;
        this.topic = "starting";
        this.id = id;
    }

    init() {
        let component: ClusterComponent = this;

        // Create the Graph Component
        return this.createNewGraphComponent();
    }

    createNewGraphComponent() {
        let component: ClusterComponent = this;
        return new Promise(function (resolve) {
            component.loadGraphTemplate().then(function (template) {
                document.getElementById("graphDiv_" + component.id).innerHTML = template;
            }).then(function (_) {
                BackendCommunicator.getInstance().addComponent(component)
            });
            return resolve(true)
        })
    }

    /**
     * Changes the content that is shown for the current method
     * @param content the content to be shown
     * @param topic the method that is selected
     */
    changeContent(content: string="", topic: string="") {
        // The content list indices are as follows: 0 - clustering algorithm, 1 - ground truth class labels,
        // 2- Number of instances per cluster, 3 - feature names
        // For methods 2 and 3: 4 - thresholds for the features
        // For modified method 3: 5 - additional feature names, 6 - additional feature thresholds
        
        //TODO why?
        // this.content = content;
        // this.algorithm = content[0];
        // this.topic = topic;
        // loadClusterSelect(this.content[1], this.id); //TODO

        let loc_id = this.id;
        this.reloadClusterTemplate().then(function (template) {
            document.getElementById("clusterInfoDiv_" + loc_id).innerHTML = template; //TODO
        });

    }

    /**
     * Generates the content for the current topic
     * @return The formatted content of the currently selected topic
     */
    formatClusterContent(): any[] {
        if (this.topic.includes("method")) {
            return this.methodFormatting(this.topic);
        } else if (this.topic === "starting") {
            return [{header: "Loading", content: ""}];
        } else {
            return [{header: "Unknown Topic", content: ""}];
        }
    }

    /**
     * For a given method create the content to be displayed
     * @param method the method which was selected for computing the results
     */
    methodFormatting(method: string): any[] {
        // Generates for each cluster a square with the given features as text inside
        let header;
        let cluster: any = [];
        let labels = this.content[1];
        let instances = this.content[2];
        let i = 0;
        let correction = 0;
        if (labels[0] == -1) {
            header = "Noisy Data";
            cluster.push({
                header: header,
                content: this.formatting(method, 0),
                nr_instances : instances[0], //TODO
                label: labels[0],
                idc: this.id + "" + 0,
            });
            i += 1;
            // To ensure that the clusters are numbered from 0 to n
            correction = 1
        }
        for (i; i < labels.length; i++) {
            header = "Cluster " + (i-correction);
            cluster.push({
                header: header,
                content: this.formatting(method, i),
                nr_instances : instances[i], //TODO
                label: labels[i],
                idc: this.id + "" + i,
            });
        }
        return cluster
    }

    /**
     * Formats the content for each cluster that needs to be displayed
     * @param method the method which was selected for computing the results to be displayed
     * @param i the current cluster for which the content needs to be created
     */
    formatting(method: string, i: number): string {
        let featureNames = this.content[3][i];
        let text: string = "";

        // Method 1
        if (method === "method1") {
            return featureNames.join(", ")
        }

        // Additional attributes for method 3
        if (method === "modified_method3") {
            let addFeatureNames = this.content[5];
            let addFeatureThresholds = this.content[6];
            for (let j = 0; j < addFeatureNames.length; j++) {
                text += Math.round(addFeatureThresholds[i][j][0] * 1000) / 1000 + " <= " + addFeatureNames[j] + " <= " + Math.round(addFeatureThresholds[i][j][1] * 1000) / 1000 + "<br>";
            }
            text += "-----" + "<br>";
        }

        // TODO
        // If Kays implementation is used for method 2
        featureNames = this.content[3][0];
        // If the new implementation is used for method 2
        //if (method === "method2") {
        //featureNames = this.content[3][i];
        //} else {
        //featureNames = this.content[3][0];
        //}

        // Content of the Clusters for Method 2 and 3
        for (let j = 0; j < featureNames.length; j++) {
            let featureThresholds = this.content[4][i][j];
            text += Math.round(featureThresholds[0] * 1000) / 1000 + " <= " + featureNames[j] + " <= " + Math.round(featureThresholds[1] * 1000) / 1000 + "<br>";
        }

        return text
    }

    /**
     * Generates the Header for a given topic
     * @return the aforementioned topic
     */
    generateTopicHTML(): string {
        let header = "";
        switch (this.topic) {
            case "method1":
                header = "Relevant Features per Cluster";
                break;
            case "method2":
                header = "Features differentiating Cluster";
                break;
            case "method3":
                header = "Overall relevant Features";
                break;
            case "modified_method3":
                header = "Overall relevant Features and additional Attributes";
                break;
            case "starting":
                header = "Loading";
                break;
            default:
                header = "Unknown Topic"
        }
        return header
    }

    reloadClusterTemplate(): Promise<string> {
        let component: ClusterComponent = this;
        let template = require('./templates/clusterComponent.hbs');
        let rendered = template(
            {
                id: this.id,
                topicHeader: this.generateTopicHTML(),
                cluster: this.formatClusterContent(),
            })
        ;
        component.template = rendered;
        return Promise.resolve(rendered)
    }

    loadGraphTemplate(): Promise<string> {
        let template = require('./templates/graphComponent.hbs');
        let rendered = template(
            {
                id: this.id,
                is0: this.id == 0,
                is1: this.id == 1,
                is2: this.id == 2
            })
        ;

        return Promise.resolve(rendered)
    }

}
