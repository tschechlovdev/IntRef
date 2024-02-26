import {FrontendHandler} from "./FrontendHandler";
import {ClusterComponent} from "./ClusterComponent";
import {ParallelCoords} from "./graphs/parallelcoords";
import {Histogram} from "./graphs/histo";
import {generateUUID, loadGraph} from "./utils";
import { Tree } from "./clusterTree/tree";
import { brushX } from "d3";

export class BackendCommunicator {
    private static instance: BackendCommunicator;

    frontendHandler: FrontendHandler;
    mqtt = require('mqtt');
    client: any;
    frontend: any;
    //used as identifier for session in backend
    instance_id = generateUUID();

    //used before frontend handler is available to access tables in register client
    components: ClusterComponent[];
    //connected tree hierarchy
    tree: Tree;

    private constructor() {
    }

    static getInstance() {
        if (!BackendCommunicator.instance) {
            BackendCommunicator.instance = new BackendCommunicator();
        }
        return BackendCommunicator.instance;
    }


    setFrontend(frontend) {
        this.frontend = frontend
    }

    setTree(tree) {
        this.tree = tree;
    }

    addComponent(component) {
        if (this.components) {
            this.components.push(component)
        } else {
            this.components = [component]
        }

    }

    init(): Promise<any> {

        let bc = this;
        let id : any;

        let promise: Promise<boolean> = new Promise<boolean>(function (resolve) {
            //this.frontendHandler = frontendHandler
            bc.client = bc.mqtt.connect('mqtt://129.69.209.180:1884');
            //client.connect("129.69.209.180", 1883, 60)
            //register mqtt
            bc.client.on('connect', function () {
                bc.client.subscribe('clustering_communicator/frontend/#');
                //console.log("connected to MQTT-Broker");
                resolve(true)
            });

            bc.client.on('message', function (topic, message) {
                message = JSON.parse(message);
                //console.error("message just arrived with configuration")
                //console.error(message)
                //console.error(message["instance_id"])
                //check if message destination is this client
                if (message["instance_id"] == bc.instance_id) {
                    switch (topic) {
                        case "clustering_communicator/frontend/nodeInfoUpdateFrontend":
                            //update node information in hierarchical view
                            bc.tree.getNodeById(message["node_id"]).updateNodeInformation(message)
                            break;
                        case "clustering_communicator/frontend/graph_data":
                            //console.info("Got graph data!");
                            let id = 0;
                            //check if version matches expected version:
                            if (message["version"] != bc.tree.getSelectedNodeVersion()) {
                                break;
                            }
                            if (message["vis_type"] === 'coordinates') {
                                let data = message["data"];
                                let visType = message["vis_type"];
                                let attributes = message["attributes"];
                                //[dc[m_id].get_data(), attributes, msg['type'], m_id]
                                //-->parallel (type=coordinates, data_list, attribute_list, m_id)
                                bc.frontend.cc[id].reloadClusterTemplate();
                                bc.frontend.cc[id].graph = new ParallelCoords(visType, data, attributes, 0, bc.tree);
                                bc.frontend.cc[id].graph.createGraph();
                            } else {
                                let visType = message["vis_type"];
                                let cluVal = message["clu_val"];
                                let claVal = message["cla_val"];
                                let att_range = message["att_range"];
                                let attribute = message["attribute"];
                                //[clu_val, cla_val, msg['type'], msg['attribute'],
                                //dc[m_id].get_attribute_range(msg['attribute']), m_id]
                                //-->hist (type=hist?, clu_val, cla_val, m_id)
                                // [clu_val, [], msg['type'], msg['attribute'],
                                //         dc[m_id].get_attribute_range(msg['attribute']), m_id]
                                bc.frontend.cc[id].changeContent();
                                bc.frontend.cc[id].graph = new Histogram(visType, cluVal, claVal, 0);
                                //create graph --> (attribute, att_range, id)
                                bc.frontend.cc[id].graph.createGraph(attribute, att_range);
                            }
                            setTimeout(() => { 
                                //adjust viewbox size
                                let sssvvvggg = document.getElementsByClassName("histogramDivClass")[0].getElementsByTagName("svg")[0]
                                let box = sssvvvggg.getBBox(); // <- get the visual boundary required to view all children
                                let viewBox = [box.x, box.y, box.width, box.height].join(" ");
                                // set viewable area based on value above
                                sssvvvggg.setAttribute("viewBox", viewBox);
                            }, 200)
                            break;
                        case "clustering_communicator/frontend/get_data_table":
                            //new data for data table of selected cluster
                            bc.tree.detailedView.updateDataTable(message);
                            break;
                        case "clustering_communicator/frontend/request_active_query":
                            //new active query from backend
                            bc.tree.detailedView.updateRecommendations(message);
                            break;
                        case "clustering_communicator/frontend/get_clust_result":
                            //download received result data
                            var element = document.createElement('a');
                            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(message["data"]));
                            element.setAttribute('download', "clust_result.csv");
                            element.style.display = 'none';
                            document.body.appendChild(element);
                            element.click();
                            document.body.removeChild(element);
                            break;
                    }
                }
                //else other client is target or message is old cluster communicator format
                else {
                    switch (topic) {
                        case "clustering_communicator/frontend/testMessage":
                            //console.info("Message available");
                            break;
                        case "clustering_communicator/frontend/method1":
                            //console.info("Feature Method 1 computed!");
    
                            id = message[message.length - 1];
                            if (bc.components.length > 0) {
                                bc.components[id].changeContent(message, "method1")
                            }
                            loadGraph(id);
                            break;
                        case "clustering_communicator/frontend/method2":
                            //console.info("Feature Method 2 computed!");
    
                            id = message[message.length - 1];
                            if (bc.components.length > 0) {
                                bc.components[id].changeContent(message, "method2")
                            }
                            loadGraph(id);
                            break;
                        case "clustering_communicator/frontend/method3":
                            //console.info("Feature Method 3 computed!");
                            id = message[message.length - 1];
                            if (bc.components.length > 0) {
                                bc.components[id].changeContent(message, "method3")
                            }
                            loadGraph(id);
                            break;
                        case  "clustering_communicator/frontend/modified_method3":
                            //console.info("Modified Feature Method 3 computed!");
                            id = message[message.length - 1];
                            if (bc.components.length > 0) {
                                bc.components[id].changeContent(message, "modified_method3")
                            }
                            loadGraph(id);
                            break;
                        case "clustering_communicator/frontend/attributes":
                            //console.info("Got attributes!");
                            bc.frontend.attributes = message[0];
                            if (message[1] == 'graph') {
                                bc.frontend.loadAttributeSelectionGraph(message[0]);
                            } else {
                                bc.frontend.loadAttributesTemplate();
                            }
                            break;
                        case "clustering_communicator/frontend/graph_data":
                            //console.info("Got graph data!");
                            id = message[message.length - 1];
                            if (message[2] === 'coordinates') {
                                // //console.log("parallel cords created with params")
                                // //console.error(message[2])
                                // //console.error(message[0])
                                // //console.error(message[1])
                                // //console.error(id)
                                //[dc[m_id].get_data(), attributes, msg['type'], m_id]
                                //-->parallel (type=coordinates, data_list, attribute_list, m_id)
                                bc.frontend.cc[id].graph = new ParallelCoords(message[2], message[0], message[1], 0);
                                bc.frontend.cc[id].graph.createGraph();
                            } else {
                                //[clu_val, cla_val, msg['type'], msg['attribute'],
                                //dc[m_id].get_attribute_range(msg['attribute']), m_id]
                                //-->parallel (type=coordinates?, clu_val, cla_val, m_id)
                                bc.frontend.cc[id].graph = new Histogram(message[2], message[0], message[1], 0);
                                //create graph --> (attribute, att_range, id)
                                bc.frontend.cc[id].graph.createGraph(message[3], message[4]);
                            }
                            break;
                        default:
                            //console.info("unknown topic")
                    }
                }
            })
        });

        return promise


    }


}
