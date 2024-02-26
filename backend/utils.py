import pandas as pd
import numpy as np


def read_dataset(filepath, separator):
    """
    Reads a given data set
    :param filepath: the filepath to the data set
    :param separator: the separator used in the data set
    :return: two values: 1. The data values, 2. The header
    """

    df = pd.read_csv(filepath, sep=separator)
    # if filepath == "seeds/seeds_dataset.txt":
    #    df.drop(['class'], axis=1, inplace=True)
    if filepath == "Datasets/students_performance/student-mat_numerical.csv":
        # df.drop(['G1', 'G2', 'G3'], axis=1, inplace=True)
        df = pd.read_csv("Datasets/students_performance/student-mat_numerical_test.csv", sep=separator)
        df.drop(['G1', 'G2'], axis=1, inplace=True)
    return df, df.columns


def get_attributes_of_dataset(filepath, separator):
    """
    Returns the attributes (header) of the dataset
    :param filepath: the filepath to the data set
    :param separator: the separator used in the data set
    :return: a list of attributes
    """
    df = pd.read_csv(filepath, sep=separator)
    if filepath == "Datasets/seeds/seeds_dataset.txt":
        df.drop(['class'], axis=1, inplace=True)
    elif filepath == "Datasets/students_performance/student-mat_numerical.csv":
        df.drop(['G1', 'G2', 'class'], axis=1, inplace=True)
    elif filepath == "Datasets/synthetic/synthetic.csv":
        df.drop(['class'], axis=1, inplace=True)
    return df.columns.tolist()


def create_clusters(clusters, data):
    """
    Given data and cluster ids create a data format that conforms with the feature_finder.py module
    :param clusters: the cluster ids
    :param data: the data values
    :return: Data that is reformatted according to the clusters: List[ np.array(cluster1 values), np.array(cluster2 values), ... ]
             clusterX values are lists of data values
    """
    clustered_data = []
    for c in clusters:
        c_data = []
        for row in data:
            if row[len(row) - 1] == c:
                c_data.append(row[:len(row) - 1])
                data.remove(row)
        clustered_data.append(np.array(c_data))

    return clustered_data
