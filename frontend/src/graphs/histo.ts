import * as d3 from "d3";
import {GraphComponent} from "./GraphComponent";


export class Histogram extends GraphComponent {

    constructor(graphType, data, additionalData = [], id: number = 0) {
        super(graphType, data, additionalData, id);
    }

    createGraph(attribute: any = null, xRange: any[] = []) {
        this.create_histogram(this.data, this.additionalData, this.graphType, attribute, xRange)
    }

    addAxis(text) {
        return
    }

    /**
     * This method is mainly taken from: https://www.d3-graph-gallery.com/graph/histogram_double.html - Credit to Yan Holtz -
     * and adapted to the use-case of this project.
     * @param cluster_data
     * @param additional_data
     * @param diagram_type
     * @param attribute
     * @param xRange
     */
    create_histogram(cluster_data: number[], additional_data: number[], diagram_type: string, attribute: string, xRange: number[]) {
        if (cluster_data == undefined) {
            return
        }

        let self = this;

        let dist = xRange[0] + xRange[1] + 1; // TODO: Correct for ticks?
        let x: any = d3.scaleLinear()
            .domain([xRange[0], xRange[1] + 1])     // can use this instead of 1000 to have the max of data: d3.max(data, function(d) { return +d.price })
            .range([0, self.width]);
        this.svg.append("g")
            .attr("transform", "translate(0," + self.height + ")")
            .call(d3.axisBottom(x));

        // set the parameters for the histogram
        let histogram = d3.histogram()
            .domain(x.domain())  // then the domain of the graphic
            .thresholds(x.ticks(dist)); // then the numbers of bins

        // And apply twice this function to data to get the bins.
        let bins1 = histogram(cluster_data);
        let bins2 = histogram(additional_data);

        // Y axis: scale and draw:
        let y = d3.scaleLinear()
            .range([self.height, 0]);
        y.domain([0, Math.max(d3.max(bins1, function (d: any) {
            return d.length;
        }), d3.max(bins2, function (d: any) {
            return d.length;
        }))]);
        this.svg.append("g")
            .call(d3.axisLeft(y));

        let tooltip = d3.select("#histogramDiv_" + self.id)
            .append("div")
            .style("opacity", 0)
            .attr("class", "tooltip")
            .style("background-color", "black")
            .style("color", "white")
            .style("border-radius", "5px")
            .style("padding", "10px");

        // A function that change this tooltip when the user hover a point.
        // Its opacity is set to 1: we can now see it. Plus it set the text and position of tooltip depending on the datapoint (d)
        let showTooltip = function (d) {
            tooltip
                .transition()
                .duration(100)
                .style("opacity", 1)
            tooltip
                .html("Range: " + d.x0 + " - " + d.x1)
                .style("left", (d3.mouse(this)[0] + 20) + "px")
                .style("top", (d3.mouse(this)[1]) + "px")
        };
        let moveTooltip = function (d) {
            tooltip
                .style("left", (d3.mouse(this)[0] + 20) + "px")
                .style("top", (d3.mouse(this)[1]) + "px")
        };
        // A function that change this tooltip when the leaves a point: just need to set opacity to 0 again
        let hideTooltip = function (d) {
            tooltip
                .transition()
                .duration(100)
                .style("opacity", 0)
        };

        // X-axis label
        this.svg.append("text")
            .attr("transform",
                "translate(" + (self.width / 2) + " ," +
                (self.height + self.margin.top + 20) + ")")
            .style("text-anchor", "middle")
            .text("" + attribute);

        // Y-axis label
        this.svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - self.margin.left)
            .attr("x", 0 - (self.height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text("Frequency");

        // append the bars for series 2
        this.svg.selectAll("rect")
            .data(bins2)
            .enter()
            .append("rect")
            .attr("x", 1)
            .attr("transform", function (d) {
                return "translate(" + x(d.x0) + "," + y(d.length) + ")";
            })
            .attr("width", function (d) {
                return x(d.x1) - x(d.x0) - 1;
            })
            .attr("height", function (d) {
                return self.height - y(d.length);
            })
            .style("fill", "#69b3a2")
            .style("opacity", function (d, i) {
                return 1.0
            })
            .on("mouseover", showTooltip)
            .on("mousemove", moveTooltip)
            .on("mouseleave", hideTooltip);

        // append the bars for series 1
        this.svg.selectAll("rect2")
            .data(bins1)
            .enter()
            .append("rect")
            .attr("x", 1)
            .attr("transform", function (d) {
                return "translate(" + x(d.x0) + "," + y(d.length) + ")";
            })
            .attr("width", function (d) {
                return x(d.x1) - x(d.x0) - 1;
            })
            .attr("height", function (d) {
                return self.height - y(d.length);
            })
            .style("fill", "#404080")
            .style("opacity", function (d, i) {
                return 1.0
            })
            .on("mouseover", showTooltip)
            .on("mousemove", moveTooltip)
            .on("mouseleave", hideTooltip);

        // Move smaller bar to the front
        this.svg.selectAll("rect")
            .filter(function (d, i) {
                return d < bins1[i]
            })
            .raise();
        this.svg.selectAll("rect2")
            .filter(function (d, i) {
                return d < bins2[i]
            })
            .raise();


        // Handmade legend
        let legend = d3.select("#diagramLegend_" + this.id);
        legend.style("height", '40px');
        legend.selectAll('*').remove();
        legend.append("circle").attr("cx", 60).attr("cy", 25).attr("r", 6).style("fill", "#404080");
        legend.append("text").attr("x", 70).attr("y", 31).text("Cluster Data").style("font-size", "15px").attr("alignment-baseline", "middle");
        if (diagram_type !== "attribute") {
            legend.append("circle").attr("cx", 170).attr("cy", 25).attr("r", 6).style("fill", "#69b3a2");
            legend.append("text").attr("x", 180).attr("y", 31).text(diagram_type + " Data").style("font-size", "15px").attr("alignment-baseline", "middle");
        }
    }

}
