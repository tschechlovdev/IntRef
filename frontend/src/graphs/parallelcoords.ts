import * as d3 from "d3";
import {normalize} from "./utils";
import '../css/parallelcoordinates.css'
import {GraphComponent} from "./GraphComponent";
import { Tree } from "../clusterTree/tree";


export class ParallelCoords extends GraphComponent {

    dimensions;
    y = {};
    ul = document.createElement('ul');
    g;
    x;
    foreground;
    dragging = {};
    excluded_groups = [];
    tree: any;

    constructor(graphType, data, additionalData = [], id, tree: any=null) {
        super(graphType, data, additionalData, id);
        this.tree = tree;
    }

    createGraph() {
        // In case of the coordinates plot, the additional data are the "coordinates" i.e. the attributes/axes
        this.create_parallel_coordinates_plot(this.data, this.additionalData)

    }

    addAxis(text) {
        // Add clicked node as y-axis
        let index = this.additionalData.indexOf(text);

        let self = this;
        this.y[index] = d3.scaleLinear()
            .domain(d3.extent(this.data, function (p) {
                return +p[index];
            }))
            .range([self.height, 0]);

        // Add clicked node to dimensions
        this.dimensions.push(index);
        this.g.selectAll('.axis').remove();
        this.g.append("g")
            .attr("class", "axis")
            .each(function (d: string) {
                if (self.y.hasOwnProperty(d)) {
                    d3.select(this).call(d3.axisLeft(self.y[0]).ticks(5).scale(self.y[d]));
                }
            })
            .attr("class", function (d: string) {
                return "axis" + d
            })
            // Add axis title
            .append("text")
            .style("text-anchor", "middle")
            .attr("y", -9)
            .text(function (d: string) {
                if (self.y.hasOwnProperty(d)) {
                    return self.additionalData[d];
                }
            })
            .style("fill", "black")
            .on('click', function (d: any) {
                self.removeAxis(self, d)
            });
        //Transition the graph
        this.x.domain(this.dimensions);
        this.g.attr("transform", function (d: string) {
            if (self.position(d) != undefined) {
                return "translate(" + self.position(d) + ")";
            }
        });
        ParallelCoords.transition(this.foreground)
            .attr("d", function (d) {
                return d3.line()(self.dimensions.map(function (p) {
                    return [self.position(p), self.y[p](d[p])];
                }))
            });
    }

    /**
     * This method is mainly taken from: https://www.d3-graph-gallery.com/graph/parallel_custom.html - Credit to Yan Holtz -
     * and adapted to the use-case of this project.
     * With this method a parallel coordinates plot is created, which visualizes the cluster result of a data set
     * @param data The data set which was clustered, consisting of the 2d array. Columns are the attributes, the class and the prediction via clustering
     * @param coordinates The attribute names which are used for the parallel coordinates
     */
    create_parallel_coordinates_plot(data: number[][], coordinates: string[]) {

        if (data == undefined) {
            return
        }

        // Axis //TODO The range of the scaling is this way to ensure, that less overlapping of multiple graphs takes place
        this.x = d3.scalePoint().range([-60, this.width - 100]).padding(1);
        let self = this;

        // Get and normalize the cluster labels to the range [0..1] so they can be used for color determination later on
        let clusterno = data.map(function (value, index) {
            return value[value.length - 1];
        });
        let norm_labels = normalize(clusterno);
        let unique_clusterno: number[] = [...new Set(clusterno)].sort((a, b) => a - b);

        // Remove cluster labels and class labels from the given data
        data = data.map(function (val) {
            return val.slice(0, -2);
        });
        coordinates = coordinates.slice(0, -2);

        let listDiv = document.getElementById("deletedAxisDiv_" + this.id);
        listDiv.appendChild(this.ul);

        // Extract the list of dimensions and create a scale for each.
        // IMPORTANT: Instead of taking the column/axis names as an accessor for y, the index is taken
        this.x.domain(self.dimensions = d3.keys(data[0]).filter(function (d: any) {
            return d != "name" && (self.y[d] = d3.scaleLinear()
                .domain(d3.extent(data, function (p) {
                    return +p[d];
                }))
                .range([self.height, 0]));
        }));

        // Draw the lines
        this.foreground = this.svg.append("g")
            .attr("class", "foreground")
            .selectAll("path")
            .data(data)
            .enter()
            .append("path")
            .attr("class", function (d: any) {
                return "line " + "c" + clusterno[data.indexOf(d)] + "id" + self.id
            }) // 2 class for each line: 'line' and the group name
            .attr("d", path)
            .style("stroke", function (d: any) {
                return (d3.interpolateSinebow(norm_labels[data.indexOf(d)])) //TODO d3.interpolateSinebow(d.class)
            });
        //.on("mouseover", highlight)
        //.on("mouseleave", doNotHighlight);
        // Add a group element for each dimension.
        this.g = this.svg.selectAll(".coordinates")
        // For each dimension of the dataset add a 'g' element:
            .data(self.dimensions)
            .enter()
            .append("g")
            .attr("class", "coordinates")
            // I translate this element to its right position on the x axis
            .attr("transform", function (d: any) {
                return "translate(" + self.x(d) + ")";
            })
            // Add the drag behaviour via this call
            .call(d3.drag()
                .subject(function (d: any) {
                    return {x: self.x(d)};
                })
                .on("start", function (d: any) {
                    self.dragging[d] = self.x(d);
                })
                .on("drag", function (d: string) {
                    self.dragging[d] = Math.min(self.width, Math.max(0, d3.event.x)); // Current position
                    self.foreground.attr("d", path);
                    self.dimensions.sort(function (a, b) {
                        return self.position(a) - self.position(b);
                    });
                    self.x.domain(self.dimensions);
                    // Makes the axis draggable
                    self.g.attr("transform", function (d: string) {
                        return "translate(" + self.position(d) + ")";
                    });
                })
                .on("end", function (d: string) {
                    delete self.dragging[d];
                    //Snaps the paths and axes to the fixed positions
                    ParallelCoords.transition(d3.select(this)).attr("transform", "translate(" + self.x(d) + ")");
                    ParallelCoords.transition(self.foreground).attr("d", path);
                })
            );

        // Add an axis and title.
        // Build the axis with this call function
        this.g.append("g")
            .attr("class", "axis")
            .each(function (d: string) {
                d3.select(this).call(d3.axisLeft(self.y[0]).ticks(5).scale(self.y[d]));
            })
            .attr("class", function (d: string) {
                return "axis" + d
            })
            // Add axis title
            .append("text")
            .style("text-anchor", "middle")
            .attr("y", -9)
            .text(function (d: string) {
                return coordinates[d]; //TODO
            })
            .style("fill", "black")
            .on('click', function (d: any) {
                self.removeAxis(self, d)
            });

        // Add and store a brush for each axis.
        this.g.append("g")
            .attr("class", "brush")
            .each(function (d) {
                d3.select(this).call(self.y[d].brush = d3.brushY()
                    .extent([[-10, 0], [10, self.height]])
                    .on("start", brushstart)
                    .on("brush", brush)
                    .on("end", brush));
            })
            .selectAll("rect")
            .attr("x", -8)
            .attr("width", 16);

        // Highlight the line that is hovered
        /*function highlight(d: any) {
            // first every group turns grey
            d3.selectAll(".line")
                .transition().duration(200)
                .style("stroke", "lightgrey")
                .style("opacity", "0.5");
            // Second the hovered cluster takes its color
            d3.selectAll(".c" + clusterno[data.indexOf(d)])
                .transition().duration(200)
                .style("stroke", d3.interpolateSinebow(normalize(clusterno)[data.indexOf(d)]))
                .style("opacity", "1");
        }

        // Unhighlight
        function doNotHighlight(d: any) {
            d3.selectAll(".line")
                .transition().duration(200).delay(1000)
                .style("stroke", function (d: any) {
                    return (d3.interpolateSinebow(normalize(clusterno)[data.indexOf(d)]))
                })
                .style("opacity", "1")
        }*/

        function path(d) {
            return d3.line()(self.dimensions.map(function (p) {
                return [self.position(p), self.y[p](d[p])];
            }));
        }

        // Handles a brush event, toggling the display of foreground lines.
        function brush() {
            let actives = [];
            self.svg.selectAll(".brush")
                .filter(function (d) {
                    return d3.brushSelection(this);
                })
                .each(function (d) {
                    actives.push({
                        dimension: d,
                        extent: d3.brushSelection(this)
                    });
                });

            self.foreground.style("display", function (d) {
                return actives.every(function (p) {
                    return p.extent[0] <= self.y[p.dimension](d[p.dimension]) && self.y[p.dimension](d[p.dimension]) <= p.extent[1];
                }) ? null : "none";
            });
        }

        function brushstart() {
            d3.event.sourceEvent.stopPropagation();
        }

        let legend = this.create_legend(this, normalize(unique_clusterno), unique_clusterno, this.id);
    }

    position(d: string) {
        let v = this.dragging[d];
        return v == null ? this.x(d) : v;
    }

    static transition(f: any) {
        return f.transition().duration(500);
    }

    removeAxis(self, d) {
        // Append to list
        let li = document.createElement('li');
        let text = document.createTextNode(self.additionalData[d]);
        li.appendChild(text);
        self.ul.appendChild(li);
        // Remove axis from axis array, dimensions array, and visualization
        delete self.y["" + d];
        self.dimensions.splice(self.dimensions.indexOf("" + d), 1);
        self.g.selectAll(".axis" + d).remove();

        //Transition the graph
        self.x.domain(self.dimensions);
        self.g.attr("transform", function (d: string) {
            if (self.position(d) != undefined) {
                return "translate(" + self.position(d) + ")";
            }
        });
        ParallelCoords.transition(this.foreground).attr("d", function (d) {
            return d3.line()(self.dimensions.map(function (p) {
                return [self.position(p), self.y[p](d[p])];
            }))
        });
    }

    create_legend(self, selector: any[], data: any[], id): any {
        let legend = d3.select("#diagramLegend_" + id);
        let height = 0; // Not nice, can probably be done better
        legend.selectAll('*').remove();

        legend.selectAll("mydots")
            .data(selector)
            .enter()
            .append("circle")
            // 0 is where the first dot appears. 25 is the distance between dots
            .attr("cx", function (d, i) {
                return 7 + i % 10 * 79
            })
            .attr("cy", function (d, i) {
                return 25 + Math.floor(i / 10) * 25
            })
            .attr("class", function (d, i) {
                return "co" + i + "id" + self.id
            })
            .attr("r", 7)
            .style("fill", function (d, i) {
                let node = self.tree.getNodeByName(d);
                //let color = node.nodeColor;
                let color="rgb(220,53,69)"
                return color
            });

        legend.selectAll("mylabels")
            .data(data)
            .enter()
            .append("text")
            .attr("x", function (d, i) {
                return 17 + i % 10 * 79
            })
            .attr("y", function (d, i) {
                let y = 29 + Math.floor(i / 10) * 25;
                if (y > height) height = y;
                return y
            })
            .attr("class", function (d) {
                return "legend" + self.id + " la" + d + "id" + self.id
            })
            .text(function (d) {
                if (d == -1) {
                    return "Noisy Data"
                }
                return "Cluster " + d
            })
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle");


        // Catch on click events on the legend
        d3.selectAll(".legend" + self.id).on("click", function (d, i) {
            if (self.excluded_groups.includes(d)) {
                d3.selectAll(".c" + data[data.indexOf(d)] + "id" + self.id)
                    .style("opacity", "1");
                let idx = self.excluded_groups.indexOf(d);
                self.excluded_groups.splice(idx, 1);
                d3.selectAll(".la" + d + "id" + self.id).style("fill", "black");
                //let color = d3.interpolateSinebow(selector[i]);
                let node = self.tree.getNodeByName(d);
                let color = node.nodeColor;
                d3.selectAll(".co" + i + "id" + self.id).style("fill", color);
                //document.getElementById("clu_cont_" + self.id + "" + i).style.borderColor = color;
                //set correct color
                d3.selectAll(".c" + d + "id" + self.id).style("stroke", color);
            } else {
                d3.selectAll(".c" + data[data.indexOf(d)] + "id" + self.id)
                    .style("opacity", "0");
                self.excluded_groups.push(d);
                d3.selectAll(".la" + d + "id" + self.id).style("fill", "lightgrey");
                d3.selectAll(".co" + i + "id" + self.id).style("fill", "lightgrey");
                //document.getElementById("clu_cont_" + self.id + "" + i).style.borderColor = "lightgrey";
            }
        });

        $("#diagramLegend_" + self.id + " > text").each((i, obj) => {
            let test = $(obj)
            let clList = $(obj).attr('class')
            let classes = clList.split(/\s+/)
            $.each(classes, function (index, item) {
                if (item.slice(0, 2) === 'la') {
                    //is label -> use val to apply color
                    let n_name = item.slice(2);
                    let id_index = n_name.search("id")
                    let id = n_name.slice(id_index)
                    n_name = n_name.slice(0, id_index);
                    let node = self.tree.getNodeByName(n_name);
                    let color = node.nodeColor;
                    d3.selectAll(".c" + n_name + "id" + self.id).style("stroke", color);
                    d3.selectAll(".co" + i + "id" + self.id).style("fill", color);
                }
            });
        });

        document.getElementById("diagramLegend_" + id).style.height = height + 10 + "px";
        $(".histogramDivClass").css("width", "600px");

        return legend
    }

}



