import * as d3 from "d3";

export abstract class GraphComponent {

    graphType: string;
    data: any[];
    additionalData: any[];
    svg: any;
    margin;
    width;
    height;
    id;

    protected constructor(graphType, data, additionalData, id: number = 0) {
        this.graphType = graphType;
        this.data = data;
        this.additionalData = additionalData;
        this.id = id;
        this.setupSvg()
    }

    setupSvg() {
        // append the svg object to the body of the page
        document.getElementById("histogramDiv_" + this.id).innerText = ""; //TODO

        // set the dimensions and margins of the graph
        this.margin = {top: 30, right: 10, bottom: 30, left: 40};
        if (this.graphType === 'coordinates') {
            document.getElementById("deletedAxisDiv_" + this.id).innerHTML = "";
            document.getElementById("deletedAxisDiv_" + this.id).hidden = false;
            this.width = 800 - this.margin.left - this.margin.right;
        } else {
            document.getElementById("deletedAxisDiv_" + this.id).hidden = true;
            this.width = 400 - this.margin.left - this.margin.right;
        }
        this.height = 400 - this.margin.top - this.margin.bottom;
        this.svg = d3.select("#histogramDiv_" + this.id) //TODO
            .append("svg")
            // .attr("width", this.width + this.margin.left + this.margin.right)
            // .attr("height", this.height + this.margin.top + this.margin.bottom)
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("transform", "translate(" + "0" + "," + "20" + ")")
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("viewBox", "0 0 700 550")
            .append("g");
    }

    abstract addAxis(text);

    abstract createGraph()

}
