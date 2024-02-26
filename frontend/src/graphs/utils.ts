import * as d3 from "d3";

export function minValue(cluster_data: any, class_data: any) {
    let min_clu = Math.min(...cluster_data);
    let min_cla = Math.min(...class_data);
    return min_clu < min_cla ? min_clu : min_cla
}

export function maxValue(cluster_data: any, class_data: any) {
    let max_clu = Math.max(...cluster_data);
    let max_cla = Math.max(...class_data);
    return max_clu < max_cla ? max_cla : max_clu
}

/**
 * Normalizes the cluster labels, so they are between 0 and 1
 */
export function normalize(clusterno: number[]): number[] {
    // As the first and last color of the used spectrum are the same, the normalization is compensated a bit for that
    //TODO can be done better
    let min = Math.min(...clusterno);
    let max = Math.max(...clusterno) * 1.05;
    if (min == -1) {
        max += 1
    }
    let labels = [];
    for (let i = 0; i < clusterno.length; i++) {
        if (min == -1) {
            labels.push(((clusterno[i] + 1) / max) + 0.05)
        } else {
            labels.push((clusterno[i] / max) + 0.05)
        }

    }
    return labels;
}
