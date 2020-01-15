/** @format */
import RouteHandler from 'app/App/RouteHandler';
import { actions } from 'app/BasicReducer';
import { I18NApi } from 'app/I18N';
import RelationTypesAPI from 'app/RelationTypes/RelationTypesAPI';
import api from 'app/Search/SearchAPI';
import TemplatesAPI from 'app/Templates/TemplatesAPI';
import ThesaurisAPI from 'app/Thesauris/ThesaurisAPI';
import UsersAPI from 'app/Users/UsersAPI';
import React from 'react';
import Helmet from 'react-helmet';

import SettingsNav from './components/SettingsNavigation';
import SettingsAPI from './SettingsAPI';

/**
 * A given template property may refer to an existing thesaurus to provide
 * multi-select values. This function resolves a template property name that
 * refers to a particular thesaurus.
 */
function resolveTemplateProp(thesaurus, templates) {
  let matchingProp;
  for (let i = 0; i < templates.length; i += 1) {
    const template = templates[i];
    const matchProp = template.properties.find(prop => prop.content === thesaurus._id);
    if (matchProp !== undefined) {
      matchingProp = matchProp;
      // TODO: Consider supporting multiple fields referring to the same thesaurus.
      break;
    }
  }
  return matchingProp;
}

function getSuggestionsQuery(matchingTemplateProperty, templateID) {
  const query = {
    select: ['sharedId'],
    limit: 1,
    filters: {},
    unpublished: true,
    types: [templateID],
  };
  const { name } = matchingTemplateProperty;
  const filters = {};
  filters[name] = {
    values: ['missing'],
  };
  filters[`_${name}`] = {
    values: ['any'],
  };
  query.filters = filters;
  return query;
}
export class Settings extends RouteHandler {
  static async requestState(requestParams) {
    const request = requestParams.onlyHeaders();
    const [user, thesauri, relationTypes, translations, collection, templates] = await Promise.all([
      UsersAPI.currentUser(request),
      ThesaurisAPI.getThesauri(request),
      RelationTypesAPI.get(request),
      I18NApi.get(request),
      SettingsAPI.get(request),
      TemplatesAPI.get(requestParams.onlyHeaders()),
    ]);

    // Fetch models associated with known thesauri.
    const allModels = await Promise.all(
      thesauri.map(thesaurus => ThesaurisAPI.getModelStatus(request.set({ model: thesaurus.name })))
    );
    const models = allModels.filter(model => !model.hasOwnProperty('error'));

    const withModels = [];
    const modeledThesauri = thesauri.map(thesaurus => {
      const relevantModel = models.find(model => model.name === thesaurus.name);
      if (relevantModel !== undefined) {
        withModels.push(thesaurus._id);
        return {
          ...thesaurus,
          model_available: relevantModel.preferred != null,
        };
      }
      return { ...thesaurus, model_available: false };
    });

    // This builds and queries elasticsearch for suggestion counts per thesaurus
    const props = modeledThesauri
      .filter(t => t.enable_classification)
      .map(thesaurus => resolveTemplateProp(thesaurus, templates));
    const allDocsWithSuggestions = await Promise.all(
      [].concat(
        ...props.map(p =>
          templates.map(t => {
            const reqParams = requestParams.set(getSuggestionsQuery(p, t._id));
            return api.search(reqParams);
          })
        )
      )
    );

    // This processes the search results per thesaurus and stores the aggregate  number of documents to review
    const propToAgg = props.map(p => templates.map(t => [p, [t, allDocsWithSuggestions.shift()]]));
    propToAgg.forEach(tup => {
      tup.forEach(perm => {
        const prop = perm[0];
        const results = perm[1][1];
        if (results.aggregations.all.hasOwnProperty(`_${prop.name}`)) {
          const { buckets } = results.aggregations.all[`_${prop.name}`];
          let soFar = 0;
          buckets.forEach(bucket => {
            soFar += bucket.filtered.doc_count;
          });
          const thesaurus = modeledThesauri.find(t => t._id === prop.content);
          // NOTE: These suggestions are totaling per-value suggestions per
          // document, so certain documents with more than one suggested value
          // may be counted more than once.
          // TODO: Make document counts unique.
          if (!thesaurus.hasOwnProperty('suggestions')) {
            thesaurus.suggestions = 0;
          }
          thesaurus.suggestions += soFar;
        }
      });
    });

    return [
      actions.set('auth/user', user),
      actions.set('dictionaries', modeledThesauri),
      actions.set('thesauri/models', models),
      actions.set('relationTypes', relationTypes),
      actions.set('translations', translations),
      actions.set('settings/collection', collection),
    ];
  }

  render() {
    return (
      <div className="row settings">
        <Helmet title="Settings" />
        <div className="settings-navigation">
          <SettingsNav />
        </div>
        <div className="settings-content">{this.props.children}</div>
      </div>
    );
  }
}

export default Settings;
