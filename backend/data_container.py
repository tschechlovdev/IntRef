import copy
import utils as ih
import clustering as c
import numpy as np
from collections import defaultdict
from sklearn.preprocessing import LabelEncoder


class DataContainer:
    """
    Holds the data and clustering results for a given dataset
    """

    # Specification of the stored request
    dataset = ""
    cluster_algo = ""

    # Stored data
    df = None
    data = None
    header = None

    # Stored clustering results
    cluster_result = []
    majority_labels = []
    data_labels = []  # A flat list of all labels for each data instance

    def __init__(self, dataset, c_algo, separator):
        # TODO Currently it is assumed, that the last column of a dataset is its class and is named 'class'
        self.dataset = dataset
        self.cluster_algo = c_algo
        self.separator = separator
        self.df_with_unique_rowid = None
        self.string_columns = None
        self.unencoded_data = None
        self.d = defaultdict(LabelEncoder)

    def from_data_container(data_container: "DataContainer"):
        n_container =  DataContainer(data_container.dataset, data_container.cluster_algo, data_container.separator)
        n_container.header = data_container.header
        n_container.d = data_container.d
        n_container.string_columns = data_container.string_columns
        return n_container

    def init_from_file(self):
        self.df, self.header = ih.read_dataset(self.dataset, self.separator)
        self.unencoded_df = copy.deepcopy(self.df)
        self.unencoded_df_unique_row_id = copy.deepcopy(self.df)
        self.unencoded_df_unique_row_id["un_row_id_random12345613"] = self.df.index
        self.encode_data() #handle string values
        self.df_with_unique_rowid = copy.deepcopy(self.df)
        self.df_with_unique_rowid["un_row_id_random12345613"] = self.df.index
        #self.cluster_result, self.majority_labels, self.data_labels = c.cluster(self.df.values.tolist(), c_algo, c_param, True)
        #self.df['C_Label'] = self.data_labels
        self.data = self.df.values.tolist()  # Data with cluster labels

    def get_attribute_values_for_cluster(self, attribute):
        # Wanted attribute values of the given cluster
        clu_val = self.df[attribute].values.tolist()

        # if diagram_type == "class":
        #     # Get data for the majority class of the given cluster
        #     m_class = self.majority_labels[int(cluster)]
        #     cla_val = self.df.loc[self.df['class'] == m_class, attribute].values.tolist()
        # elif diagram_type == "dataset":
        #     # Get the data of the whole data set
        #     cla_val = self.df[attribute].values.tolist()
        # else:
        #     cla_val = []

        return clu_val, []

    def encode_data(self):
        df = self.df
        self.string_columns = [ col  for col, dt in df.dtypes.items() if dt == object]
        self.df[self.string_columns] = self.df[self.string_columns].apply(lambda x: self.d[x.name].fit_transform(x))

    def get_data_clabel(self, label: str):
        data = self.df
        data["C_Label"] = label
        data = data.values.tolist()
        try:
            self.df = self.df.drop(columns=['C_Label'])
        except:
            pass
        return data

    def get_df_clabel(self, label: str):
        data = self.unencoded_df
        data["C_Label"] = label
        try:
            self.df = self.df.drop(columns=['C_Label'])
        except:
            pass
        return data

    def get_unique_row_id_index(self, row_id):
        index = self.df_with_unique_rowid.index[self.df_with_unique_rowid['un_row_id_random12345613'] == row_id].tolist()
        if len(index) == 1:
            return index[0]
        return -1

    def get_attributes_of_dataset(self):
        return self.df.columns.tolist()

    def get_attributes_of_dataset_with_unique(self):
        return self.df_with_unique_rowid.columns.tolist()

    def get_attributes_of_dataset_clabel(self):
        return self.get_attributes_of_dataset() + ["C_Label"]

    def get_header(self):
        return self.header

    def get_header_no_class(self):
        return self.df.loc[:, self.df.columns != 'class'].columns

    def set_df_from_unique_df(self):
        self.df = self.df_with_unique_rowid.loc[:, self.df_with_unique_rowid.columns != 'un_row_id_random12345613']

    def set_unencoded_df_from_unencoded_unique(self):
        self.unencoded_df = self.unencoded_df_unique_row_id.loc[:, self.unencoded_df_unique_row_id.columns != 'un_row_id_random12345613']

    def set_data_from_df(self):
        self.data = self.df.values.tolist()

    def get_data(self):
        return self.data

    def get_unique_id_data(self):
        return self.df_with_unique_rowid.values.tolist()

    def get_unencoded_unique_id_data(self):
        return self.unencoded_df_unique_row_id.values.tolist()

    def get_data_summary(self):
        return self.df.loc[:, self.df.columns != 'class'].describe().to_json(orient='records')

    def get_data_table_data(self, c_as):
        temp_table = self.unencoded_df_unique_row_id.loc[:, self.unencoded_df_unique_row_id.columns != 'class']
        temp_table["cluster_assignment"] = c_as
        data = temp_table.to_json(orient='records')
        try:
            self.unencoded_df_unique_row_id = self.unencoded_df_unique_row_id.drop(columns=['cluster_assignment'])
        except:
            pass
        return data

    # def get_data_table_data(self, c_as):
    #     temp_table = self.df_with_unique_rowid.loc[:, self.df_with_unique_rowid.columns != 'class']
    #     temp_table["cluster_assignment"] = c_as
    #     data = temp_table.to_json(orient='records')
    #     try:
    #         self.df_with_unique_rowid = self.df_with_unique_rowid.drop(columns=['cluster_assignment'])
    #     except:
    #         pass
    #     return data

    def get_length(self):
        return len(self.data)

    def get_data_as_nparray(self):
        return np.array(self.data)

    def get_data_as_nparray_no_class(self):
        return np.array(self.df.loc[:, self.df.columns != 'class'].values.tolist())

    def get_data_true_id(self):
        return self.df_with_unique_rowid["un_row_id_random12345613"].values.tolist()

    def get_attributes_of_dataset_no_class(self):
        return self.df.loc[:, self.df.columns != 'class'].columns.tolist()

    def get_data_without_noise(self):
        # Removes unclustered data from optics and dbscan
        data_no_noise = []
        for row in self.data:
            if row[len(row) - 1] != -1:
                data_no_noise.append(row)
        return data_no_noise

    def get_majority_labels(self):
        return self.majority_labels

    def get_nr_instances_per_cluster(self):
        # nr_instances = []
        # for cluster in self.cluster_result:
        #     nr_instances.append(len(cluster))
        return 42

    def get_attribute(self, attribute):
        return self.df[attribute]

    def get_configuration(self):
        return self.dataset, self.cluster_algo, "" #self.cluster_parameter

    def get_clustering_result(self):
        return self.cluster_result

    def get_attribute_range(self, attribute):
        min_val = self.df[attribute].min()
        max_val = self.df[attribute].max()
        return [int(min_val), int(max_val)]
