import { TreeNode } from "./node";
import interact from 'interactjs'
import { generateUUID } from "../utils";
import { DetailedView } from "./detailedView";

/**
 * Tree containing the cluster hierarchy and hierarchy operations
 */
export class Tree {

    rootNode: TreeNode;
    //node selection and additional info display
    selectedNode: TreeNode;
    detailedView: DetailedView;
    //version of selected node each time some transformation influences this node version is changed
    //--> don't process requests with details containing old node version
    selectedNodeVersion: string = "";
    //zoom in and out
    scaleFactor: number = 1;
    //attributes of data
    attributes: string[] = [];

    constructor() {
        this.setControlOnClick();
        this.rootNode = new TreeNode(null, this);
        this.setupInteraction();
        this.adjustDragDropScrollWidth();
        this.detailedView = new DetailedView(this);
    }

    /**
     * Get a flat (1D-Array) representation of all tree nodes
     * @returns flat representation
     */
    flatten(): TreeNode[] {
        let x = this.recursiveChildNodes(this.rootNode)
        ////console.warn(x)
        return x
    }

    /**
     * Initis attribute dropdown menus of graph visualization of connected detailed info vis
     */
    initAttDrop() {
        this.detailedView.initVisAttributeDropdown();
    }

    /**
     * Get attributes of underlying data
     * @returns attributes
     */
    getAttributes(): string[] {
        return this.attributes;
    }

    /**
     * Get current edit version of selected node
     * @returns edit version
     */
    getSelectedNodeVersion(): string {
        return this.selectedNodeVersion;
    }
    
    /**
     * set new version for selected node
     * @param version new version
     */
    setSelectedNodeVersion(version: string): void {
        this.selectedNodeVersion = version;
    }

    /**
     * selected node changed --> update node version
     */
    changeSelectedNodeVersion(): void {
        //something changed within the selected node --> assign new uuid
        this.setSelectedNodeVersion(generateUUID());
        this.detailedView.updateClusterSelection(this.selectedNode.getChildren());
    }

    /**
     * change the currently (for detailed visualization) selected node
     * @param n_node 
     */
    changeSelectedNode(n_node: TreeNode): void {
        this.selectedNode = n_node;
        this.detailedView.updateClusterSelection(n_node.getChildren());
    }

    /**
     * Recursively get child nodes
     * @param startNode point from which child nodes are of interest
     * @returns child nodes
     */
    recursiveChildNodes(startNode: any): TreeNode[] {
        let children = startNode.getChildren();
        if (children.length == 0) {
            ////console.info("yay")
            return [startNode];
        }
        else {
            let nodes: TreeNode[] = [];
            for (let i = 0; i < children.length; i++) {
                let temp = this.recursiveChildNodes(children[i])
                nodes = nodes.concat(temp);
            }
            ////console.info(nodes)
            return [startNode].concat(nodes)
        }
    }

    /**
     * Get a node of the tree by its node id property
     * @param id id of node 
     * @returns node or null if not found
     */
    getNodeById(id: string): TreeNode|null {
        let nodes = this.flatten();
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id == id) {
                return nodes[i];
            }
        }
        return null;
    }

    /**
     * Get a node of the tree by its node name property
     * @param name name of node
     * @returns node or null if not found
     */
    getNodeByName(name: string): TreeNode|null {
        let nodes = this.flatten();
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].name == name) {
                return nodes[i];
            }
        }
        return null;
    }

    /**
     * Get node that is currently selected by the user
     * @returns 
     */
    getSelectedNode(): TreeNode {
        return this.selectedNode
    }

    /**
     * Set onclick listeners for control tree view ui operations
     */
    setControlOnClick() {
        let self = this;
        //zoom in function
        document.getElementById("treeZoomIn").addEventListener('click', (event) => { 
            let treeView = document.getElementById("clusterHierarchieTree");
            self.scaleFactor += 0.1;
            treeView.style.zoom = String(self.scaleFactor);
            // treeView.style.transform = "scale(" + this.scaleFactor + ")";
            // treeView.style["transform-origin"] = "0% 0% 0px;"
            if (self.selectedNode != undefined) {
                self.selectedNode.htmlElem.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        })
        //zoom out function
        document.getElementById("treeZoomOut").addEventListener('click', (event) => {
            let treeView = document.getElementById("clusterHierarchieTree");
            self.scaleFactor -= 0.1;
            // treeView.style.transform = "scale(" + this.scaleFactor + ")";
            // treeView.style["transform-origin"] = "0% 0% 0px;"
            treeView.style.zoom = String(self.scaleFactor);
            if (self.selectedNode != undefined) {
                self.selectedNode.htmlElem.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        })
        $(document).on("click", function(e) {
            $("#connectionContextMenu").hide();
            $("#nodeContextMenu").hide();
        });
    }

    /**
     * Setup drag and drop interactions with nodes 
     */
    setupInteraction() {
        let self = this;
        // target elements with the "draggable" class
        interact('.draggable')
        .draggable({
        // enable inertial throwing
        inertia: true,
        // keep the element within the area of it's parent
        modifiers: [
            interact.modifiers.restrictRect({
            restriction: 'parent',
            endOnly: true
            })
        ],
        // enable autoScroll
        autoScroll: true,

        listeners: {
            // call this function on every dragmove event
            move: dragMoveListener,

            // call this function on every dragend event
            end (event) {
                ////console.error(event.target);
                ////console.error(event.target.getAttribute("id"));
                let node = self.getNodeById(event.target.getAttribute("id"))
                let affectedNodes = self.recursiveChildNodes(node)
                affectedNodes = affectedNodes.slice(1)
                ////console.log(node)
                let xOffset = event.pageX - event.x0
                let yOffset = event.pageY - event.y0
                ////console.log("dx: " + xOffset)
                for (let i = 0; i < affectedNodes.length; i++) {
                    affectedNodes[i].addToTransform(xOffset, yOffset);
                    affectedNodes[i].updateConnection();
                    // affectedNodes[i].offLeft += xOffset
                    // affectedNodes[i].offTop += yOffset
                    // affectedNodes[i].calcPosition();
                }
                node.updateConnection();
                self.adjustDragDropScrollWidth();
            }
        }
        })

        function dragMoveListener (event) {
        var target = event.target
        // keep the dragged position in the data-x/data-y attributes
        var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
        var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

        // // translate the element
        target.style.transform = 'translate(' + x + 'px, ' + y + 'px)'

        // // update the posiion attributes
        target.setAttribute('data-x', x)
        target.setAttribute('data-y', y)
}
    }

    /**
     * Ugly fix for scroll width of tree view panel
     */
    adjustDragDropScrollWidth() {
        let scrollWidth = document.getElementById("hierarchyTreeContainerScroll").scrollWidth;
        let scrollHeight = document.getElementById("hierarchyTreeContainerScroll").scrollHeight;
        //set draganddrop to scrollWidth
        document.getElementById("clusterHierarchieTree").style.width = scrollWidth + 'px';
        document.getElementById("clusterHierarchieTree").style.height = scrollHeight + 'px';
    }

    /**
     * recursively updates connection lines between node ui elements
     * @param startNode node from which line update should start
     */
    recursiveConnectionLineUpdate(startNode: TreeNode) {
        this.adjustDragDropScrollWidth();
        let affectedNodes = this.recursiveChildNodes(startNode)
        for (let i = 0; i < affectedNodes.length; i++) {
            affectedNodes[i].updateConnection();
        }
    }


}
