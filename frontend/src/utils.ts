import {BackendCommunicator} from "./BackendCommunicator";

/**
 * Create a dictionary for the attributes, so they can later be used for a template
 */
export function reformatAttributes(attributes: any[]): any[] {
    let atts = [];
    for (let att of attributes) {
        atts.push({name: att, value: att})
    }
    return atts
}

/**
 * Requests information for displaying the selected graph
 */
export function loadGraph(id: any) {
    let attribute = document.forms["GraphForm_" + id].elements["graphAttDropdown_" + id].value;
    let cluster = document.forms["GraphForm_" + id].elements["clusterDropdown_" + id].value;
    let diagramType = document.forms["GraphForm_" + id].elements["diagramRadios_" + id].value;
    let instance_id = BackendCommunicator.getInstance().instance_id;
    let selected_node_id = BackendCommunicator.getInstance().tree.getSelectedNode().id;
    let version = BackendCommunicator.getInstance().tree.getSelectedNodeVersion();
    //console.error("requested vis data for cluster_id: " + cluster)
    if (BackendCommunicator.getInstance().tree.getSelectedNode() != undefined) {
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/get_graph", JSON.stringify({
            "version": version,
            "attribute": attribute,
            "cluster": cluster,
            "type": diagramType,
            "instance_id": instance_id,
            "selected_node_id": selected_node_id,
        }));
    }
}

/**
 * Loads the cluster dropdown values for the graph selection
 *
 */
export function loadClusterSelect(majority_labels, id: number) {
    // let cluSelect = document.getElementById("clusterDropdown_" + id);
    // document.forms["GraphForm_" + id].elements["clusterDropdown_" + id].options.length = 0;
    // let i = 0;
    // let len = majority_labels.length;
    // if (document.forms["InputForm"].elements["algoDropdown"].value != "pckmeans" && majority_labels[0] == -1) {
    //     cluSelect.append(new Option("Noisy Data", "cluster_-1"));
    //     len = majority_labels.length - 1;
    // }
    // for (i ; i < len; i++) {
    //     cluSelect.append(new Option("Cluster " + i, "cluster_" + i))
    // }
}

export function generateUUID() { // Public Domain/MIT
    var d = new Date().getTime();//Timestamp
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export function appendBadgeElement(jquerySelector: string, badgeContent: string, badgeLevel: string = "info", pill=false, jqueryElem=null) {
    let pillstr = '';
    if (pill) {
        pillstr = "badge-pill"
    }
    //generate template of badge
    let template = require('./templates/interClust/util_elements/badge.hbs');
    let rendered = template({
        pill: pillstr,
        badgeLevel: badgeLevel,
        badgeContent: badgeContent,
    });
    //get element
    let element: any;
    if (jqueryElem) {
        element = jqueryElem;
    }
    else {
        element = $(jquerySelector)
    }
    element.append(rendered);
}

export function getContextMenuPosition(mouse, menu_selector, direction, scrollDir) {
    let win = $(window).width()
    //scroll = $("#hierarchyTreeContainerScroll")[scrollDir],
    let menu = $(menu_selector).width()    
    if (direction === "height") {
        win = $(window).height()
        //scroll = $("#hierarchyTreeContainerScroll")[scrollDir],
        menu = $(menu_selector).height()    
    }
    let scroll = $(window).scrollLeft()
    if (scrollDir === "scrollTop") {
        scroll = $(window).scrollTop()
    }
    let position = mouse + scroll;     
    // opening menu would pass the side of the page
    if (mouse + menu > win && menu < mouse) {
        position -= menu;
    }
    
    return position;
}  